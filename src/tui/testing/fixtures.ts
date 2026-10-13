import { ApiClient } from "../../api/client";
import type { Session } from "../context/api";

/** An override that answers with an API error envelope and status. */
export function apiError(status: number, code: string, message: string) {
  return { __status: status, error: { code, message } };
}

/**
 * Canned API responses for rendering the TUI in tests and screenshots. Paths
 * match on pathname + query; unknown paths answer 404 like the real API.
 */
const now = Date.UTC(2026, 9, 12, 18, 0, 0);
const hour = 3_600_000;

const services = [
  {
    id: "svc_web",
    projectId: "prj_shop",
    name: "storefront",
    slug: "storefront",
    repoUrl: "https://github.com/acme/storefront",
    branch: "main",
    framework: "next",
    host: "storefront.acme.app",
    port: 3000,
    status: "running",
    needsRedeploy: false,
    autoDeploy: true,
    liveDeploymentId: "dep_2",
    url: "https://storefront.acme.app",
    routed: true,
    domains: ["shop.acme.com"],
    createdAt: now - 40 * 24 * hour,
    replicas: 2,
    cpuLimit: 500,
    memoryLimit: 512,
    autoscale: true,
    minReplicas: 2,
    maxReplicas: 3,
    targetCpuPercent: 70,
    targetMemoryPercent: null,
    scaleOnCpu: true,
  },
  {
    id: "svc_api",
    projectId: "prj_shop",
    name: "orders-api",
    slug: "orders-api",
    repoUrl: "https://github.com/acme/orders",
    branch: "main",
    framework: "node",
    host: "orders-api.acme.app",
    port: 8080,
    status: "running",
    needsRedeploy: true,
    autoDeploy: true,
    liveDeploymentId: "dep_9",
    url: "https://orders-api.acme.app",
    routed: true,
    domains: [],
    createdAt: now - 12 * 24 * hour,
    replicas: 1,
    cpuLimit: null,
    memoryLimit: null,
    autoscale: false,
  },
  {
    id: "svc_jobs",
    projectId: "prj_ops",
    name: "nightly-jobs",
    slug: "nightly-jobs",
    repoUrl: "https://github.com/acme/jobs",
    branch: "main",
    framework: "worker",
    host: "jobs.acme.app",
    port: 0,
    status: "stopped",
    needsRedeploy: false,
    autoDeploy: false,
    liveDeploymentId: null,
    url: "https://jobs.acme.app",
    routed: false,
    domains: [],
    createdAt: now - 3 * 24 * hour,
    replicas: 1,
    cpuLimit: 250,
    memoryLimit: 256,
    autoscale: false,
  },
];

const wave = (i: number, base: number) =>
  Math.round(base * (1 + 0.6 * Math.sin(i / 6)) + (i % 5) * base * 0.05);

const buckets = Array.from({ length: 96 }, (_, i) => ({
  bucket: now - (96 - i) * 15 * 60_000,
  requests: wave(i, 900),
  bytesOut: wave(i, 9_000_000),
  s2xx: wave(i, 850),
  s3xx: 20,
  s4xx: 25,
  s5xx: i % 17 === 0 ? 8 : 1,
  probes: 3,
  pageviews: wave(i, 260),
  uniques: wave(i, 80),
  p95: 140,
}));

const overview = {
  range: "24h",
  from: now - 24 * hour,
  to: now,
  step: 15 * 60_000,
  totals: {
    requests: 91_234,
    bytesIn: 120_000_000,
    bytesOut: 870_000_000,
    s2xx: 86_000,
    s3xx: 1_900,
    s4xx: 2_400,
    s5xx: 180,
    pageviews: 24_800,
    bots: 3_100,
    probes: 640,
    uniques: 7_420,
    p50: 38,
    p95: 142,
    p99: 410,
  },
  buckets,
  hosts: [
    { host: "shop.acme.com", requests: 61_000, bytesOut: 600_000_000 },
    { host: "storefront.acme.app", requests: 21_000, bytesOut: 200_000_000 },
    { host: "orders-api.acme.app", requests: 9_234, bytesOut: 70_000_000 },
  ],
  services: [],
  visitorsUnavailable: false,
  online: 23,
};

const breakdown = (dimension: string, rows: [string, number][]) => {
  const total = rows.reduce((a, [, n]) => a + n, 0);
  return {
    dimension,
    range: "24h",
    from: now - 24 * hour,
    to: now,
    rows: rows.map(([value, requests]) => ({
      value,
      requests,
      bytesOut: requests * 1000,
      share: requests / total,
      pageviews: Math.round(requests / 3),
    })),
    other: null,
    approximate: false,
  };
};

const metrics = {
  replicas: { ready: 2, desired: 2 },
  pods: [
    {
      pod: "storefront-7f9c-abcde",
      cpuMillicores: 180,
      memoryMiB: 301,
      restarts: 0,
      state: "Running",
    },
    {
      pod: "storefront-7f9c-fghij",
      cpuMillicores: 95,
      memoryMiB: 288,
      restarts: 1,
      state: "Running",
    },
  ],
  limits: { cpuMillicores: 500, memoryMiB: 512 },
};

const series = {
  from: now - hour,
  to: now,
  step: 60_000,
  source: "raw",
  series: [
    {
      name: "cpu_millicores",
      unit: "millicores",
      agg: "avg",
      points: buckets.slice(0, 60).map((b, i) => [b.bucket, 150 + wave(i, 60)]),
    },
    {
      name: "memory_mib",
      unit: "MiB",
      agg: "avg",
      points: buckets.slice(0, 60).map((b, i) => [b.bucket, 560 + (i % 7) * 4]),
    },
    {
      name: "ready_replicas",
      unit: "count",
      agg: "min",
      points: buckets.slice(0, 60).map((b) => [b.bucket, 2]),
    },
  ],
};

export const FIXTURES: Record<string, unknown> = {
  "/apps/services": { services },
  "/apps/projects": {
    projects: [
      { id: "prj_shop", name: "Shop", slug: "shop", createdAt: now },
      { id: "prj_ops", name: "Ops", slug: "ops", createdAt: now },
    ],
  },
  "/traffic/overview": overview,
  "/traffic/breakdown/page": breakdown("page", [
    ["/", 9000],
    ["/products", 4100],
    ["/cart", 1200],
    ["/checkout", 640],
  ]),
  "/traffic/breakdown/referer": breakdown("referer", [
    ["google.com", 5100],
    ["(direct)", 3900],
    ["instagram.com", 820],
  ]),
  "/traffic/breakdown/country": breakdown("country", [
    ["AR", 6100],
    ["US", 2300],
    ["ES", 700],
  ]),
  "/traffic/breakdown/device": breakdown("device", [
    ["mobile", 7100],
    ["desktop", 3200],
  ]),
  "/traffic/breakdown/status": breakdown("status", [
    ["200", 86000],
    ["304", 1900],
    ["404", 2100],
    ["500", 180],
  ]),
  "/account/activity": {
    activity: [
      {
        id: "a1",
        time: "2m ago",
        actor: "ci",
        action: "deployed",
        target: "storefront",
        kind: "deploy",
      },
      {
        id: "a2",
        time: "1h ago",
        actor: "ada",
        action: "scaled",
        target: "orders-api",
        kind: "update",
      },
    ],
  },
  "/account/usage": {
    usage: {
      monthToDate: 41.2,
      projected: 96.5,
      runRate: 3.1,
      ledger: 0,
      vcpus: 4,
      memoryGb: 8,
      storageGb: 60,
      droplets: 1,
      dropletLimit: 10,
    },
  },
  "/apps/services/svc_web": { service: services[0] },
  "/apps/services/svc_api": { service: services[1] },
  "/apps/services/svc_jobs": { service: services[2] },
  "/apps/services/svc_web/metrics": { metrics },
  "/apps/services/svc_api/metrics": {
    metrics: {
      ...metrics,
      replicas: { ready: 1, desired: 1 },
      pods: [metrics.pods[0]],
      limits: { cpuMillicores: 250, memoryMiB: 256 },
    },
  },
  "/apps/services/svc_web/metrics/series": series,
  "/apps/services/svc_api/metrics/series": series,
  "/organizations/org_acme": {
    organization: {
      id: "org_acme",
      name: "Acme",
      kind: "team",
      plan: "pro",
      color: "#c4fa00",
      cell: {
        id: "shared",
        dedicated: false,
        autoscaling: true,
        scaleWindows: false,
        maxReplicas: 3,
        pageAccessControl: true,
        trafficAnalytics: true,
        liveMetrics: true,
        costEstimates: true,
      },
    },
  },
  "/databases": {
    databases: [
      {
        id: "db_main",
        name: "main-pg",
        engine: "pg",
        version: "16",
        status: "online",
        region: "us-east",
        nodes: 1,
        size: "1 vCPU · 2 GB",
        storageGb: 30,
      },
    ],
  },
  "/databases/db_main/metrics": {
    metrics: {
      available: true,
      cpuPct: 12,
      memPct: 48,
      load1: 0.2,
      load5: 0.3,
      load15: 0.25,
    },
  },
  "/droplets": { droplets: [] },
};

export interface RecordedRequest {
  method: string;
  path: string;
  body: unknown;
}

/** A fetch that serves {@link FIXTURES} and records every request. */
export function fixtureFetch(
  overrides: Record<string, unknown> = {},
  seen: RecordedRequest[] = [],
): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    // `__delay_<METHOD>` overrides slow a method down (e.g. a save in flight).
    const delay = overrides[`__delay_${method}`] as number | undefined;
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    seen.push({
      method,
      path: url.pathname + url.search,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const table = { ...FIXTURES, ...overrides };
    const body =
      method === "GET"
        ? (table[url.pathname + url.search] ?? table[url.pathname])
        : method === "PATCH"
          ? {
              service: {
                ...(table[url.pathname] as { service: object })?.service,
                ...JSON.parse(String(init?.body ?? "{}")),
                needsRedeploy: true,
              },
            }
          : { ok: true, deployment: { id: "dep_new", status: "queued" } };
    if (body === undefined)
      return new Response(
        JSON.stringify({ error: { code: "not_found", message: "Not found" } }),
        { status: 404 },
      );
    const status = (body as { __status?: number }).__status ?? 200;
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
}

export function fixtureSession(
  overrides: Record<string, unknown> = {},
  seen: RecordedRequest[] = [],
): Session {
  const ctx = {
    apiUrl: "https://api.test",
    token: "ub_test",
    org: "org_acme",
    json: false,
    trace: false,
    retries: 0,
  };
  return {
    client: new ApiClient({
      apiUrl: ctx.apiUrl,
      token: ctx.token,
      org: ctx.org,
      fetchFn: fixtureFetch(overrides, seen),
    }),
    ctx,
    identity: 'token "ci"',
    orgId: "org_acme",
    contextName: "acme",
  };
}
