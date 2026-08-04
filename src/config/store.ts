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
export interface StoredConfig {
  /** API base URL set via `ubctl login --api-url`. */
  apiUrl?: string;
  /** The `ub_live_…` secret. Stored locally; the file is written 0600. */
  token?: string;
  /** Default organization id (X-Org-Id) for session-scoped calls. */
  org?: string;
  /** Named authentication contexts; secrets remain inside this same 0600 file. */
  contexts?: Record<string, { apiUrl?: string; token?: string; org?: string }>;
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
    for (const key of ["apiUrl", "token", "org"] as const) {
      if (key in patch) {
        if (patch[key] === undefined) delete current[key];
        else current[key] = patch[key];
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
    (key === "apiUrl" || key === "token" || key === "org") &&
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
  context: { apiUrl: string; token: string; org: string },
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
  for (const key of ["apiUrl", "token", "org"] as const)
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
