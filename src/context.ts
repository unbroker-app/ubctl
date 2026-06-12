import { DEFAULT_API_URL, ENV } from "./constants";
import { loadConfig } from "./config/store";

/** Global flags declared on the root program (see program.ts). */
export interface GlobalOptions {
  apiUrl?: string;
  org?: string;
  json?: boolean;
}

/** Everything a command needs to talk to the API, with sources resolved. */
export interface Context {
  apiUrl: string;
  token: string | undefined;
  org: string | undefined;
  json: boolean;
}

/**
 * Resolve the effective context from, in descending precedence:
 *   1. explicit CLI flags
 *   2. environment variables (UBCTL_*)
 *   3. the persisted config file
 *   4. built-in defaults (apiUrl only)
 *
 * The token is never a flag here — it's set by `login` (or UBCTL_TOKEN) so it
 * doesn't leak into shell history or `ps` output across every command.
 */
export function resolveContext(opts: GlobalOptions): Context {
  const file = loadConfig();
  const env = process.env;

  const apiUrl =
    opts.apiUrl ?? env[ENV.apiUrl] ?? file.apiUrl ?? DEFAULT_API_URL;
  const token = env[ENV.token] ?? file.token;
  const org = opts.org ?? env[ENV.org] ?? file.org;

  return {
    apiUrl: apiUrl.replace(/\/+$/, ""),
    token: token && token.length > 0 ? token : undefined,
    org: org && org.length > 0 ? org : undefined,
    json: opts.json ?? false,
  };
}
