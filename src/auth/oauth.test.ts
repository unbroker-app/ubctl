import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { browserLogin, deviceLogin, oauthBase, oauthToken } from "./oauth";
import {
  loadConfig,
  loadOAuthCredentials,
  saveConfig,
  saveContextCredentials,
  switchContext,
} from "../config/store";
import { ApiClient } from "../api/client";
import { relayMcp } from "../commands/mcp";
import { createServer } from "node:http";

const originalHome = process.env.XDG_CONFIG_HOME;
const homes: string[] = [];
afterEach(() => {
  if (originalHome === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = originalHome;
  for (const home of homes.splice(0))
    rmSync(home, { recursive: true, force: true });
});
function isolated() {
  const home = mkdtempSync(join(tmpdir(), "ubctl-oauth-"));
  homes.push(home);
  process.env.XDG_CONFIG_HOME = home;
}
const tokens = (suffix = "test") => ({
  access_token: `ub_at_${suffix}`,
  refresh_token: `ub_rt_${suffix}`,
  scope: "api:read offline_access",
  expires_in: 600,
  org_id: "org-test",
  grant_id: "grant-test",
});

test("OAuth origins reject insecure remote hosts and URL credentials", () => {
  assert.equal(oauthBase("http://127.0.0.1:9123/"), "http://127.0.0.1:9123");
  for (const url of [
    "http://example.com",
    "https://user:secret@example.com",
    "https://example.com/path",
    "https://example.com?key=value",
  ])
    assert.throws(() => oauthBase(url));
});
test("browser flow verifies state and issuer and exchanges its PKCE verifier", async (t) => {
  let form: URLSearchParams | undefined;
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += String(chunk);
    form = new URLSearchParams(body);
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(tokens()));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  let authorizeUrl: URL | undefined;
  t.mock.method(process.stderr, "write", (value: string) => {
    const match = String(value).match(/http:\/\/127[^\s]+/);
    if (!match) return true;
    authorizeUrl = new URL(match[0]!);
    const callback = new URL(authorizeUrl.searchParams.get("redirect_uri")!);
    callback.searchParams.set("state", authorizeUrl.searchParams.get("state")!);
    callback.searchParams.set("iss", `${base}/oauth`);
    callback.searchParams.set("code", "one-time-code");
    void (async () => {
      const wrong = new URL(callback);
      wrong.searchParams.set("state", "wrong");
      assert.equal((await fetch(wrong)).status, 400);
      await fetch(callback);
    })();
    return true;
  });
  try {
    const result = await browserLogin(base, { open: false });
    assert.equal(result.org, "org-test");
    assert.equal(form!.get("code"), "one-time-code");
    const { createHash } = await import("node:crypto");
    assert.equal(
      createHash("sha256")
        .update(form!.get("code_verifier")!)
        .digest("base64url"),
      authorizeUrl!.searchParams.get("code_challenge"),
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
test("device flow backs off on slow_down and never prints bearer credentials", async (t) => {
  const output: string[] = [];
  t.mock.method(process.stderr, "write", (value: string) => {
    output.push(String(value));
    return true;
  });
  const waits: number[] = [];
  let requests = 0;
  const fetchFn = async (url: string | URL | Request) => {
    if (String(url).endsWith("/device/code"))
      return Response.json({
        device_code: "opaque-device-code",
        user_code: "ABCD-EFGH",
        verification_uri: "https://app.example.com/device",
        expires_in: 600,
        interval: 5,
      });
    requests++;
    if (requests === 1)
      return Response.json({ error: "authorization_pending" }, { status: 400 });
    if (requests === 2)
      return Response.json({ error: "slow_down" }, { status: 400 });
    return Response.json(tokens());
  };
  const result = await deviceLogin("https://api.example.com", {
    fetchFn: fetchFn as typeof fetch,
    sleep: async (ms) => {
      waits.push(ms);
    },
  });
  assert.equal(result.oauth.accessToken, "ub_at_test");
  assert.deepEqual(waits, [5000, 5000, 10000]);
  assert.ok(!output.join("").includes("ub_at_"));
  assert.ok(!output.join("").includes("opaque-device-code"));
});
test("refresh is single-flight and updates only its captured context", async () => {
  isolated();
  const oauth = {
    grantId: "grant-test",
    accessToken: "ub_at_old",
    refreshToken: "ub_rt_old",
    expiresAt: 1,
    resource: "https://api.example.com",
    scope: "api:read offline_access",
  };
  saveContextCredentials("work", {
    apiUrl: oauth.resource,
    org: "org-test",
    token: oauth.accessToken,
    oauth,
  });
  saveContextCredentials("personal", {
    apiUrl: oauth.resource,
    org: "org-personal",
    token: "ub_live_personal",
  });
  let count = 0;
  const fetchFn = async () => {
    count++;
    return Response.json(tokens("new"));
  };
  const result = await Promise.all([
    oauthToken(oauth.resource, "work", oauth, fetchFn as typeof fetch),
    oauthToken(oauth.resource, "work", oauth, fetchFn as typeof fetch),
  ]);
  assert.deepEqual(result, ["ub_at_new", "ub_at_new"]);
  assert.equal(count, 1);
  assert.equal(loadConfig().currentContext, "personal");
  assert.equal(loadConfig().token, "ub_live_personal");
  switchContext("work");
  assert.equal(loadConfig().token, "ub_at_new");
  // Simulate a context writer that read the metadata before rotation.
  saveConfig({ token: oauth.accessToken, oauth });
  assert.equal(
    loadOAuthCredentials(loadConfig().oauth!).accessToken,
    "ub_at_new",
  );
  assert.equal(
    await oauthToken(oauth.resource, "work", oauth, fetchFn as typeof fetch),
    "ub_at_new",
  );
  assert.equal(count, 1);
  saveConfig({ token: "ub_live_replacement", oauth: undefined });
  assert.equal(loadConfig().contexts?.work?.oauth, undefined);
});
test("API client sends OAuth only as a bearer and refuses redirects", async () => {
  let headers: Headers | undefined;
  const client = new ApiClient({
    apiUrl: "https://api.example.com",
    credentials: async () => ({ token: "ub_at_test", bearer: true }),
    fetchFn: (async (_url, opts) => {
      headers = new Headers(opts?.headers);
      assert.equal(opts?.redirect, "error");
      return Response.json({ ok: true });
    }) as typeof fetch,
  });
  await client.get("/account");
  assert.equal(headers!.get("authorization"), "Bearer ub_at_test");
  assert.equal(headers!.get("x-api-key"), null);
});

test("device sign-in rejects malformed payloads and unsafe verification URLs without echoing secrets", async () => {
  const valid = {
    device_code: "opaque-code",
    user_code: "ABCD-EFGH",
    verification_uri: "https://app.example.com/device",
    expires_in: 600,
    interval: 5,
  };
  for (const payload of [
    null,
    { ...valid, user_code: "secret\nforged-output" },
    {
      ...valid,
      verification_uri: "https://user:secret@app.example.com/device",
    },
    { ...valid, verification_uri: "javascript:secret" },
    { ...valid, expires_in: -1 },
  ]) {
    await assert.rejects(
      deviceLogin("https://api.example.com", {
        fetchFn: (async () => Response.json(payload)) as typeof fetch,
      }),
      (error: Error) => !error.message.includes("secret"),
    );
  }
  await assert.rejects(
    deviceLogin("https://api.example.com", {
      fetchFn: (async () => new Response('{"secret":')) as typeof fetch,
    }),
    /Could not start device sign-in/,
  );
});
test("MCP adapter supports JSON, finite SSE and bodyless notifications", async () => {
  const auth = async () => ({ authorization: "Bearer ub_at_test" });
  const message = { jsonrpc: "2.0", id: 1, result: {} };
  assert.deepEqual(
    await relayMcp("https://api.example.com/mcp", {}, auth, (async () =>
      Response.json(message)) as typeof fetch),
    [message],
  );
  assert.deepEqual(
    await relayMcp(
      "https://api.example.com/mcp",
      {},
      auth,
      (async () =>
        new Response(`event: message\ndata: ${JSON.stringify(message)}\n\n`, {
          headers: { "content-type": "text/event-stream" },
        })) as typeof fetch,
    ),
    [message],
  );
  assert.deepEqual(
    await relayMcp(
      "https://api.example.com/mcp",
      {},
      auth,
      (async () => new Response(null, { status: 204 })) as typeof fetch,
    ),
    [],
  );
});
