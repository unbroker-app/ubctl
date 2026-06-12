// Default Unbroker API base URL. Points at the development cloud for now — the
// only environment we target while the platform is in development. Override per
// invocation with `--api-url`, per shell with `UBCTL_API_URL`, or persist one
// with `ubctl login --api-url …`.
export const DEFAULT_API_URL = "https://dev.api.cloud.unbroker.app";

// Environment variable names the CLI reads (take precedence over the config
// file, but not over an explicit flag).
export const ENV = {
  apiUrl: "UBCTL_API_URL",
  token: "UBCTL_TOKEN",
  org: "UBCTL_ORG",
} as const;
