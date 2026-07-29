// Default Unbroker API base URL: the control plane, on unbroker.cloud. Override
// per invocation with `--api-url`, per shell with `UBCTL_API_URL`, or persist
// one with `ubctl login --api-url …`.
//
// This must stay on unbroker.cloud. It used to point at
// `dev.api.cloud.unbroker.app`, a hostname that never had a DNS record: Vercel
// DNS answered every subdomain of the unbroker.app zone with its anycast IPs,
// so the default looked alive while resolving to an edge that 404s. The zone
// moved to Cloudflare on 2026-07-28 and is mail-only now, so the wildcard
// stopped answering and the default became NXDOMAIN. context.test.ts guards the
// host to keep the CLI's out-of-the-box default on a domain we actually serve.
export const DEFAULT_API_URL = "https://api.unbroker.cloud";

// Environment variable names the CLI reads (take precedence over the config
// file, but not over an explicit flag).
export const ENV = {
  apiUrl: "UBCTL_API_URL",
  token: "UBCTL_TOKEN",
  org: "UBCTL_ORG",
} as const;
