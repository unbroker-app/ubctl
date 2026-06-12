import { homedir } from "node:os";
import { join } from "node:path";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
} from "node:fs";

/** Persisted CLI configuration. All fields optional — a fresh install has none. */
export interface StoredConfig {
  /** API base URL set via `ubctl login --api-url`. */
  apiUrl?: string;
  /** The `ub_live_…` secret. Stored locally; the file is written 0600. */
  token?: string;
  /** Default organization id (X-Org-Id) for session-scoped calls. */
  org?: string;
}

/**
 * Directory holding the config file. Honours `XDG_CONFIG_HOME` (so it composes
 * with dotfile managers and test isolation), falling back to `~/.config`.
 */
export function configDir(): string {
  const base = process.env.XDG_CONFIG_HOME?.trim();
  return join(base && base.length > 0 ? base : join(homedir(), ".config"), "ubctl");
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
  mkdirSync(configDir(), { recursive: true, mode: 0o700 });
  writeFileSync(configPath(), JSON.stringify(next, null, 2) + "\n", {
    mode: 0o600,
  });
  return next;
}

/** Remove a single key (used by `logout` to drop the token but keep apiUrl/org). */
export function clearConfigKey(key: keyof StoredConfig): StoredConfig {
  const next = { ...loadConfig() };
  delete next[key];
  if (existsSync(configPath())) {
    writeFileSync(configPath(), JSON.stringify(next, null, 2) + "\n", {
      mode: 0o600,
    });
  }
  return next;
}

/** Delete the whole config file (used by tests; not wired to a command). */
export function deleteConfig(): void {
  rmSync(configPath(), { force: true });
}
