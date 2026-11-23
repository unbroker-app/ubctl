import { randomBytes, createHash } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { open, unlink } from "node:fs/promises";
import {
  configPath,
  loadConfig,
  loadOAuthCredentials,
  saveOAuthCredentials,
  type OAuthCredentials,
} from "../config/store";
import { CliError } from "../util/errors";

const CLIENT_ID = "ubctl";
const DEFAULT_SCOPE = "api:read api:write offline_access";
const OAUTH_ERRORS = new Set([
  "authorization_pending",
  "slow_down",
  "access_denied",
  "expired_token",
  "invalid_client",
  "invalid_grant",
  "invalid_request",
  "invalid_scope",
  "invalid_target",
  "unauthorized_client",
  "temporarily_unavailable",
  "server_error",
  "subscription_required",
]);
export function oauthBase(apiUrl: string): string {
  const url = new URL(apiUrl);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "")
  )
    throw new CliError(
      "OAuth requires an API origin without a path, credentials, query or fragment",
    );
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    )
  )
    throw new CliError(
      "OAuth requires HTTPS (HTTP is allowed only on loopback)",
    );
  return url.origin;
}

interface Tokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  org_id: string;
  grant_id: string;
}
function credentials(tokens: Tokens, resource: string): OAuthCredentials {
  if (
    typeof tokens.access_token !== "string" ||
    !tokens.access_token.startsWith("ub_at_") ||
    !Number.isFinite(tokens.expires_in) ||
    tokens.expires_in <= 0 ||
    typeof tokens.org_id !== "string" ||
    !tokens.org_id ||
    tokens.org_id.length > 200 ||
    typeof tokens.scope !== "string" ||
    !tokens.scope ||
    typeof tokens.grant_id !== "string" ||
    !/^[A-Za-z0-9_-]{1,100}$/.test(tokens.grant_id) ||
    (tokens.refresh_token !== undefined &&
      (typeof tokens.refresh_token !== "string" ||
        !tokens.refresh_token.startsWith("ub_rt_")))
  )
    throw new CliError(
      "The authorization server returned an invalid token response",
    );
  return {
    grantId: tokens.grant_id,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
    resource,
    scope: tokens.scope,
  };
}

export async function oauthRequest(
  base: string,
  path: string,
  body: Record<string, string>,
  fetchFn: typeof fetch = fetch,
): Promise<Tokens> {
  const response = await fetchFn(`${oauthBase(base)}/oauth/${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  const result = (await response.json().catch(() => {
    throw new CliError("The authorization server returned an invalid response");
  })) as Tokens & { error?: string };
  if (!result || typeof result !== "object")
    throw new CliError("The authorization server returned an invalid response");
  if (!response.ok)
    throw new CliError(
      typeof result.error === "string" && OAUTH_ERRORS.has(result.error)
        ? result.error
        : "OAuth request failed; verify server availability and delegated-access support",
    );
  return result;
}

export function openBrowser(url: string) {
  const command =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "explorer.exe"
        : "xdg-open";
  const child = spawn(command, [url], { stdio: "ignore", detached: true });
  child.on("error", () => {
    /* The URL is always printed for manual opening. */
  });
  child.unref();
}

export async function browserLogin(
  apiUrl: string,
  options: { scope?: string; open?: boolean; resource?: string } = {},
) {
  const base = oauthBase(apiUrl);
  const resource = options.resource ?? base;
  const verifier = randomBytes(32).toString("base64url");
  const state = randomBytes(32).toString("base64url");
  let resolveCode!: (code: string) => void;
  let rejectCode!: (error: Error) => void;
  let callbackHost = "";
  const codePromise = new Promise<string>((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });
  const server = createServer((request, response) => {
    response.setHeader("cache-control", "no-store");
    response.setHeader("content-type", "text/plain; charset=utf-8");
    response.setHeader("x-content-type-options", "nosniff");
    if (
      request.headers.host !== callbackHost ||
      !request.url?.startsWith("/callback?")
    ) {
      response.writeHead(400).end("Invalid callback target");
      return;
    }
    const url = new URL(request.url, "http://127.0.0.1");
    if (
      request.method !== "GET" ||
      url.pathname !== "/callback" ||
      url.searchParams.get("state") !== state ||
      url.searchParams.get("iss") !== `${base}/oauth`
    ) {
      response.writeHead(400).end("Invalid authorization callback");
      return;
    }
    if (url.searchParams.has("error")) {
      response.end("Authorization was denied. Return to your terminal.");
      rejectCode(new CliError("Authorization was denied"));
      return;
    }
    const code = url.searchParams.get("code");
    if (!code) {
      response.writeHead(400).end("Missing authorization code");
      return;
    }
    response.end(
      "Authorization received. Return to your terminal to verify completion.",
    );
    resolveCode(code);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new CliError(
      "Could not start the local login callback; use --device",
    );
  const redirect = `http://127.0.0.1:${address.port}/callback`;
  callbackHost = `127.0.0.1:${address.port}`;
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: redirect,
    scope: options.scope ?? DEFAULT_SCOPE,
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    resource,
  });
  const url = `${base}/oauth/authorize?${params}`;
  process.stderr.write(`Open this URL to sign in:\n${url}\n`);
  if (options.open !== false) openBrowser(url);
  const timeout = setTimeout(
    () =>
      rejectCode(new CliError("Sign-in timed out; try again or use --device")),
    10 * 60_000,
  );
  const abort = () => rejectCode(new CliError("Sign-in cancelled"));
  process.once("SIGINT", abort);
  try {
    const code = await codePromise;
    const tokens = await oauthRequest(base, "token", {
      client_id: CLIENT_ID,
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      redirect_uri: redirect,
      resource,
    });
    return { oauth: credentials(tokens, resource), org: tokens.org_id };
  } finally {
    clearTimeout(timeout);
    process.removeListener("SIGINT", abort);
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

export async function deviceLogin(
  apiUrl: string,
  options: {
    scope?: string;
    open?: boolean;
    resource?: string;
    fetchFn?: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
  } = {},
) {
  const base = oauthBase(apiUrl);
  const resource = options.resource ?? base;
  const fetchFn = options.fetchFn ?? fetch;
  const response = await fetchFn(`${base}/oauth/device/code`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      scope: options.scope ?? DEFAULT_SCOPE,
      resource,
    }),
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  const device = (await response.json().catch(() => {
    throw new CliError("Could not start device sign-in");
  })) as {
    device_code: string;
    user_code: string;
    verification_uri: string;
    verification_uri_complete?: string;
    expires_in: number;
    interval: number;
  };
  if (
    !response.ok ||
    !device ||
    typeof device !== "object" ||
    typeof device.device_code !== "string" ||
    !/^[A-Za-z0-9_-]{1,200}$/.test(device.device_code) ||
    typeof device.user_code !== "string" ||
    !/^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(device.user_code) ||
    typeof device.verification_uri !== "string" ||
    !Number.isFinite(device.expires_in) ||
    device.expires_in <= 0 ||
    !Number.isFinite(device.interval) ||
    device.interval < 0 ||
    device.interval > 600
  )
    throw new CliError("Could not start device sign-in");
  let verification: URL;
  try {
    verification = new URL(device.verification_uri);
  } catch {
    throw new CliError("Unsafe device verification URL");
  }
  if (
    verification.username ||
    verification.password ||
    verification.hash ||
    (verification.protocol !== "https:" &&
      !(
        base.startsWith("http:") &&
        verification.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(verification.hostname)
      ))
  )
    throw new CliError("Unsafe device verification URL");
  process.stderr.write(
    `Open ${verification.href}\nEnter code: ${device.user_code}\nWaiting for authorization…\n`,
  );
  if (options.open) openBrowser(verification.href);
  const end = Date.now() + Math.min(device.expires_in, 600) * 1000;
  let interval = Math.max(device.interval, 5) * 1000;
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  while (Date.now() < end) {
    await sleep(interval);
    try {
      const tokens = await oauthRequest(
        base,
        "token",
        {
          client_id: CLIENT_ID,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          device_code: device.device_code,
          resource,
        },
        fetchFn,
      );
      return { oauth: credentials(tokens, resource), org: tokens.org_id };
    } catch (error) {
      if (
        error instanceof CliError &&
        error.message === "authorization_pending"
      )
        continue;
      if (error instanceof CliError && error.message === "slow_down") {
        interval += 5000;
        continue;
      }
      throw error;
    }
  }
  throw new CliError("Device code expired; start sign-in again");
}

const refreshing = new Map<string, Promise<string>>();
/** Refresh is serialized across processes because refresh credentials rotate. */
export function oauthToken(
  apiUrl: string,
  context: string | undefined,
  expected: OAuthCredentials,
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  const base = oauthBase(apiUrl);
  const key = `${base}:${context ?? ""}:${expected.grantId}`;
  const existing = refreshing.get(key);
  if (existing) return existing;
  const run = async () => {
    const current = () => {
      const config = loadConfig();
      const saved = context ? config.contexts?.[context] : config;
      const metadata = saved?.oauth;
      if (
        !metadata ||
        saved?.apiUrl?.replace(/\/+$/, "") !== base ||
        metadata.resource !== expected.resource ||
        metadata.grantId !== expected.grantId
      )
        throw new CliError("Authentication context changed; sign in again");
      return { oauth: loadOAuthCredentials(metadata), org: saved.org };
    };
    const initial = current();
    if (initial.oauth.expiresAt > Date.now() + 60_000)
      return initial.oauth.accessToken;
    // A killed refresher cannot block a newly authorized grant or another org.
    const lockPath = `${configPath()}.${expected.grantId}.oauth-lock`;
    let lock;
    for (let attempt = 0; attempt < 200; attempt++) {
      try {
        lock = await open(lockPath, "wx", 0o600);
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    if (!lock)
      throw new CliError(
        "Another login is refreshing credentials, or a previous process left an OAuth lock; retry after checking the lock file",
      );
    try {
      const { oauth, org } = current();
      if (oauth.expiresAt > Date.now() + 60_000) return oauth.accessToken;
      if (!oauth.refreshToken)
        throw new CliError("Sign-in expired; run ubctl login again");
      const tokens = await oauthRequest(
        base,
        "token",
        {
          client_id: CLIENT_ID,
          grant_type: "refresh_token",
          refresh_token: oauth.refreshToken,
          resource: oauth.resource,
        },
        fetchFn,
      );
      if (tokens.org_id !== org || tokens.grant_id !== expected.grantId)
        throw new CliError(
          "The refreshed authorization changed organization or grant",
        );
      const next = credentials(tokens, oauth.resource);
      saveOAuthCredentials(context, next);
      return next.accessToken;
    } finally {
      await lock.close();
      await unlink(lockPath);
    }
  };
  const promise = run().finally(() => refreshing.delete(key));
  refreshing.set(key, promise);
  return promise;
}
