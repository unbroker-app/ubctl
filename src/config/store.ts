import { homedir } from "node:os";
import { join } from "node:path";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
  chmodSync,
  renameSync,
} from "node:fs";
import { randomUUID } from "node:crypto";

/** Persisted CLI configuration. All fields optional — a fresh install has none. */
export interface OAuthCredentials {
  grantId: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  resource: string;
  scope: string;
}
export interface StoredConfig {
  oauth?: OAuthCredentials;
  /** API base URL set via `ubctl login --api-url`. */
  apiUrl?: string;
  /** The `ub_live_…` secret. Stored locally; the file is written 0600. */
  token?: string;
  /** Default organization id (X-Org-Id) for session-scoped calls. */
  org?: string;
  /** Named authentication contexts; secrets remain inside this same 0600 file. */
  contexts?: Record<
    string,
    { apiUrl?: string; token?: string; org?: string; oauth?: OAuthCredentials }
  >;
  currentContext?: string;
}

/**
 * Directory holding the config file. Honours `XDG_CONFIG_HOME` (so it composes
 * with dotfile managers and test isolation), falling back to `~/.config`.
 */
export function configDir(): string {
  const base = process.env.XDG_CONFIG_HOME?.trim();
  return join(
    base && base.length > 0 ? base : join(homedir(), ".config"),
    "ubctl",
  );
}

export function configPath(): string {
  return join(configDir(), "config.json");
}

function oauthPath(grantId: string): string {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(grantId))
    throw new Error("Invalid OAuth grant identifier");
  return join(configDir(), "oauth", `${grantId}.json`);
}

/** A per-grant credential journal survives concurrent metadata/context writes. */
function writeOAuthJournal(oauth: OAuthCredentials, replace: boolean): void {
  const directory = join(configDir(), "oauth");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const path = oauthPath(oauth.grantId);
  if (!replace) {
    try {
      writeFileSync(path, JSON.stringify(oauth), { mode: 0o600, flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    return;
  }
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify(oauth), {
      mode: 0o600,
      flag: "wx",
    });
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}

export function loadOAuthCredentials(
  expected: OAuthCredentials,
): OAuthCredentials {
  const path = oauthPath(expected.grantId);
  if (!existsSync(path)) return expected;
  let parsed: OAuthCredentials;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8")) as OAuthCredentials;
  } catch {
    // Parser diagnostics can quote credential bytes from a corrupt file.
    throw new Error("OAuth credentials are unreadable; sign in again");
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    parsed.grantId !== expected.grantId ||
    parsed.resource !== expected.resource ||
    typeof parsed.accessToken !== "string" ||
    typeof parsed.expiresAt !== "number" ||
    !Number.isFinite(parsed.expiresAt) ||
    (parsed.refreshToken !== undefined &&
      typeof parsed.refreshToken !== "string")
  )
    throw new Error("Invalid OAuth credential journal; sign in again");
  return parsed;
}

export function removeOAuthCredentials(grantId: string): void {
  rmSync(oauthPath(grantId), { force: true });
}

/** Read the config file. Returns an empty object when absent or unreadable. */
export function loadConfig(): StoredConfig {
  const path = configPath();
  if (!existsSync(path)) return {};
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    return typeof parsed === "object" && parsed !== null
      ? (parsed as StoredConfig)
      : {};
  } catch {
    // A corrupt file shouldn't brick the CLI — treat it as empty.
    return {};
  }
}

/**
 * Merge a patch into the stored config and write it back atomically-ish. The
 * file holds a bearer secret, so it's created 0600 (owner read/write only).
 */
export function saveConfig(patch: StoredConfig): StoredConfig {
  const next = { ...loadConfig(), ...patch };
  if (next.currentContext && next.contexts) {
    const current = { ...(next.contexts[next.currentContext] ?? {}) };
    for (const key of ["apiUrl", "token", "org", "oauth"] as const) {
      if (key in patch) {
        if (patch[key] === undefined) delete current[key];
        else Object.assign(current, { [key]: patch[key] });
      }
    }
    next.contexts = { ...next.contexts, [next.currentContext]: current };
  }
  writeConfig(next);
  return next;
}

/** Remove a single key (used by `logout` to drop the token but keep apiUrl/org). */
export function clearConfigKey(key: keyof StoredConfig): StoredConfig {
  const next = { ...loadConfig() };
  delete next[key];
  if (
    (key === "apiUrl" || key === "token" || key === "org" || key === "oauth") &&
    next.currentContext &&
    next.contexts?.[next.currentContext]
  ) {
    const current = { ...next.contexts[next.currentContext] };
    delete current[key];
    next.contexts = { ...next.contexts, [next.currentContext]: current };
  }
  if (existsSync(configPath())) {
    writeConfig(next);
  }
  return next;
}

export function saveContext(name: string): StoredConfig {
  const config = loadConfig();
  const context = {
    apiUrl: config.apiUrl,
    token: config.token,
    org: config.org,
    oauth: config.oauth,
  };
  const next = {
    ...config,
    contexts: { ...config.contexts, [name]: context },
    currentContext: name,
  };
  writeConfig(next);
  return next;
}

/** Save validated credentials directly into a named context and select it. */
export function saveContextCredentials(
  name: string,
  context: {
    apiUrl: string;
    token: string;
    org: string;
    oauth?: OAuthCredentials;
  },
): StoredConfig {
  const config = loadConfig();
  const next = {
    ...config,
    ...context,
    contexts: { ...config.contexts, [name]: context },
    currentContext: name,
  };
  writeConfig(next);
  return next;
}

export function switchContext(name: string): StoredConfig {
  const config = loadConfig();
  const selected = config.contexts?.[name];
  if (!selected) throw new Error(`unknown context "${name}"`);
  const next = { ...config, ...selected, currentContext: name };
  for (const key of ["apiUrl", "token", "org", "oauth"] as const)
    if (!(key in selected)) delete next[key];
  writeConfig(next);
  return next;
}

export function removeContext(name: string): StoredConfig {
  const config = loadConfig();
  if (!config.contexts?.[name]) throw new Error(`unknown context "${name}"`);
  const contexts = { ...config.contexts };
  delete contexts[name];
  const next = { ...config, contexts };
  if (next.currentContext === name) delete next.currentContext;
  writeConfig(next);
  return next;
}

/** Delete the whole config file (used by tests; not wired to a command). */
export function deleteConfig(): void {
  rmSync(configPath(), { force: true });
}

function writeConfig(config: StoredConfig): void {
  mkdirSync(configDir(), { recursive: true, mode: 0o700 });
  chmodSync(configDir(), 0o700);
  for (const oauth of [
    config.oauth,
    ...Object.values(config.contexts ?? {}).map((context) => context.oauth),
  ]) {
    if (oauth) writeOAuthJournal(oauth, false);
  }
  const target = configPath();
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  try {
    // A new owner-only file avoids ever exposing the bearer token through the
    // permissions of a pre-existing config. Same-directory rename is atomic.
    writeFileSync(temporary, JSON.stringify(config, null, 2) + "\n", {
      mode: 0o600,
      flag: "wx",
    });
    renameSync(temporary, target);
    chmodSync(target, 0o600);
  } finally {
    rmSync(temporary, { force: true });
  }
}

/** Update only the captured account; a context switch must not redirect refresh. */
export function saveOAuthCredentials(
  context: string | undefined,
  oauth: OAuthCredentials,
) {
  // The server has already rotated this grant. Preserve its canonical credential
  // even if the user switched/replaced a context while the request was in flight.
  writeOAuthJournal(oauth, true);
  const config = loadConfig();
  const saved = context ? config.contexts?.[context] : config;
  if (saved?.oauth?.grantId !== oauth.grantId) return;
  if (context) {
    if (!config.contexts?.[context]?.oauth)
      throw new Error("The authentication context was removed; sign in again");
    config.contexts[context] = {
      ...config.contexts[context],
      oauth,
      token: oauth.accessToken,
    };
  }
  if (config.currentContext === context) {
    config.oauth = oauth;
    config.token = oauth.accessToken;
  }
  writeConfig(config);
}
