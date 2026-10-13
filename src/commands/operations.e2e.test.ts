// End-to-end coverage for analytics, resources and scale: each test runs the
// real CLI as a subprocess against a local fake API and asserts both the HTTP
// traffic and the printed result.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

interface Seen {
  method: string;
  path: string;
  body: unknown;
}

const service = {
  id: "svc_web",
  projectId: "prj_1",
  name: "web",
  slug: "web",
  status: "running",
  needsRedeploy: false,
  url: "https://web.example.test",
  domains: [],
  createdAt: 0,
  replicas: 2,
  cpuLimit: 500,
  memoryLimit: null,
  autoscale: false,
  minReplicas: null,
  maxReplicas: null,
  targetCpuPercent: null,
  targetMemoryPercent: null,
  scaleOnCpu: true,
};

const routes: Record<string, (body: unknown) => [number, unknown]> = {
  "GET /apps/services/svc_web": () => [200, { service }],
  "PATCH /apps/services/svc_web": (body) => [
    200,
    { service: { ...service, ...(body as object), needsRedeploy: true } },
  ],
  "POST /apps/services/svc_web/deployments": () => [
    202,
    { deployment: { id: "dep_1", status: "queued" } },
  ],
  "GET /organizations/org_test": () => [
    200,
    { organization: { id: "org_test", cell: { maxReplicas: 3 } } },
  ],
  "GET /apps/services/svc_web/metrics": () => [
    200,
    {
      metrics: {
        replicas: { ready: 2, desired: 2 },
        limits: { cpuMillicores: 500, memoryMiB: 256 },
        pods: [
          {
            pod: "web-a",
            cpuMillicores: 100,
            memoryMiB: 128,
            restarts: 0,
            state: "Running",
          },
          {
            pod: "web-b",
            cpuMillicores: null,
            memoryMiB: null,
            restarts: 2,
            state: "CrashLoopBackOff",
          },
        ],
      },
    },
  ],
  "GET /apps/services/svc_web/metrics/series?range=1h": () => [
    200,
    {
      from: 0,
      to: 1,
      step: 60_000,
      source: "raw",
      series: [
        {
          name: "cpu_millicores",
          unit: "millicores",
          agg: "avg",
          points: [
            [0, 50],
            [1, 150],
          ],
        },
      ],
    },
  ],
  "GET /apps/services": () => [
    200,
    {
      services: [
        service,
        { ...service, id: "svc_off", name: "off", status: "stopped" },
      ],
    },
  ],
  "GET /account/usage": () => [
    200,
    {
      usage: {
        vcpus: 2,
        memoryGb: 4,
        storageGb: 20,
        droplets: 1,
        dropletLimit: 5,
      },
    },
  ],
  "GET /traffic/overview?range=7d&projectId=prj_1": () => [
    200,
    {
      range: "7d",
      from: 0,
      to: 1,
      step: 3_600_000,
      totals: {
        requests: 12_000,
        bytesIn: 0,
        bytesOut: 5_000_000,
        s2xx: 11_000,
        s3xx: 500,
        s4xx: 400,
        s5xx: 100,
        pageviews: 3_000,
        bots: 50,
        probes: 20,
        uniques: 900,
        p50: 20,
        p95: 120,
        p99: 300,
      },
      buckets: [
        {
          bucket: 0,
          requests: 10,
          pageviews: 3,
          uniques: 1,
          bytesOut: 0,
          s2xx: 10,
          s3xx: 0,
          s4xx: 0,
          s5xx: 0,
          probes: 0,
          p95: 1,
        },
        {
          bucket: 1,
          requests: 30,
          pageviews: 9,
          uniques: 2,
          bytesOut: 0,
          s2xx: 30,
          s3xx: 0,
          s4xx: 0,
          s5xx: 0,
          probes: 0,
          p95: 1,
        },
      ],
      hosts: [
        { host: "shop.example.test", requests: 12_000, bytesOut: 5_000_000 },
      ],
      services: [],
      visitorsUnavailable: false,
      online: 4,
    },
  ],
  "GET /traffic/breakdown/referer?range=24h&serviceId=svc_web&limit=5": () => [
    200,
    {
      dimension: "referer",
      range: "24h",
      from: 0,
      to: 1,
      rows: [{ value: "google.com", requests: 80, bytesOut: 0, share: 0.8 }],
      other: { value: "", requests: 20, bytesOut: 0, share: 0.2 },
      approximate: false,
    },
  ],
  "GET /traffic/breakdown/page?range=24h&limit=10": () => [
    402,
    {
      error: {
        code: "subscription_required",
        message: "Traffic breakdowns require the Pro plan",
      },
    },
  ],
};

async function withApi(run: (apiUrl: string, seen: Seen[]) => Promise<void>) {
  const seen: Seen[] = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const raw = Buffer.concat(chunks).toString();
    const body: unknown = raw ? JSON.parse(raw) : undefined;
    seen.push({ method: req.method ?? "", path: req.url ?? "", body });
    const handler = routes[`${req.method} ${req.url}`];
    const [status, payload] = handler
      ? handler(body)
      : [404, { error: { code: "not_found", message: `no route ${req.url}` } }];
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(payload));
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const { port } = server.address() as { port: number };
  try {
    await run(`http://127.0.0.1:${port}`, seen);
  } finally {
    server.close();
  }
}

async function invoke(apiUrl: string, args: string[]) {
  const config = mkdtempSync(join(tmpdir(), "ubctl-ops-e2e-"));
  try {
    return await execFileAsync(
      process.execPath,
      ["--import", "tsx", "src/index.ts", ...args],
      {
        cwd: repoRoot,
        timeout: 8_000,
        env: {
          ...process.env,
          XDG_CONFIG_HOME: config,
          UBCTL_API_URL: apiUrl,
          UBCTL_TOKEN: "ub_test",
          UBCTL_ORG: "org_test",
        },
      },
    );
  } finally {
    rmSync(config, { recursive: true, force: true });
  }
}

const writes = (seen: Seen[]) => seen.filter((r) => r.method !== "GET");

test("scale sends only the changed fields and reports the diff", async () => {
  await withApi(async (apiUrl, seen) => {
    const { stdout } = await invoke(apiUrl, [
      "apps",
      "services",
      "scale",
      "svc_web",
      "--replicas",
      "3",
      "--memory",
      "1024",
    ]);
    assert.deepEqual(writes(seen), [
      {
        method: "PATCH",
        path: "/apps/services/svc_web",
        body: { replicas: 3, memoryLimit: 1024 },
      },
    ]);
    assert.match(stdout, /scale\s+2 replicas\s+3 replicas/);
    assert.match(
      stdout,
      /default memory per replica\s+500m CPU · 1024Mi memory per replica/,
    );
    assert.match(
      stdout,
      /Takes effect on the next deploy: ubctl apps deploy svc_web/,
    );
  });
});

test("scale --cpu default clears the limit and --deploy rolls out", async () => {
  await withApi(async (apiUrl, seen) => {
    await invoke(apiUrl, [
      "apps",
      "scale",
      "svc_web",
      "--cpu",
      "default",
      "--deploy",
    ]);
    assert.deepEqual(
      writes(seen).map((r) => [r.method, r.path, r.body]),
      [
        ["PATCH", "/apps/services/svc_web", { cpuLimit: null }],
        ["POST", "/apps/services/svc_web/deployments", {}],
      ],
    );
  });
});

test("scale enables autoscale with bounds and targets", async () => {
  await withApi(async (apiUrl, seen) => {
    await invoke(apiUrl, [
      "apps",
      "scale",
      "svc_web",
      "--autoscale",
      "--min",
      "1",
      "--max",
      "3",
      "--target-cpu",
      "60",
      "--target-memory",
      "80%",
    ]);
    assert.deepEqual(writes(seen)[0]?.body, {
      autoscale: true,
      minReplicas: 1,
      maxReplicas: 3,
      targetCpuPercent: 60,
      targetMemoryPercent: 80,
    });
  });
});

test("scale rejects invalid combinations before writing", async () => {
  await withApi(async (apiUrl, seen) => {
    await assert.rejects(
      invoke(apiUrl, ["apps", "scale", "svc_web", "--replicas", "5"]),
      /this tier allows at most 3 replicas/,
    );
    await assert.rejects(
      invoke(apiUrl, [
        "apps",
        "scale",
        "svc_web",
        "--autoscale",
        "--min",
        "3",
        "--max",
        "2",
      ]),
      /min \(3\) must not exceed max \(2\)/,
    );
    await assert.rejects(
      invoke(apiUrl, ["apps", "scale", "svc_web", "--cpu", "50"]),
      /cpu must be between 100 and 2000/,
    );
    await assert.rejects(
      invoke(apiUrl, [
        "apps",
        "scale",
        "svc_web",
        "--autoscale",
        "--window",
        "--window-min",
        "2",
      ]),
      /a scale window needs --window-start, --window-end, --window-tz/,
    );
    assert.deepEqual(writes(seen), []);
  });
});

test("scale --dry-run validates without saving", async () => {
  await withApi(async (apiUrl, seen) => {
    const { stdout } = await invoke(apiUrl, [
      "apps",
      "scale",
      "svc_web",
      "--replicas",
      "1",
      "--dry-run",
    ]);
    assert.match(stdout, /Dry run — nothing was saved/);
    assert.deepEqual(writes(seen), []);
  });
});

test("service resources shows limits, pod usage and history", async () => {
  await withApi(async (apiUrl) => {
    const { stdout } = await invoke(apiUrl, [
      "apps",
      "services",
      "resources",
      "svc_web",
      "--range",
      "1h",
    ]);
    assert.match(stdout, /scale:\s+2 replicas/);
    assert.match(stdout, /limits:\s+500m CPU · default memory per replica/);
    assert.match(
      stdout,
      /web-a\s+Running\s+100m\/500m\s+20%\s+128Mi\/256Mi\s+50%\s+0/,
    );
    assert.match(stdout, /web-b\s+CrashLoopBackOff\s+-\s+-\s+-\s+-\s+2/);
    assert.match(stdout, /cpu\s+▃█\s+avg 100m · peak 150m/);
  });
});

test("apps resources skips stopped services and totals the account", async () => {
  await withApi(async (apiUrl, seen) => {
    const { stdout } = await invoke(apiUrl, ["apps", "resources"]);
    assert.equal(
      seen.filter((r) => r.path === "/apps/services/svc_off/metrics").length,
      0,
    );
    assert.match(
      stdout,
      /svc_web\s+web\s+running\s+2\/2\s+2 replicas\s+100m\/1000m\s+128Mi\/512Mi/,
    );
    assert.match(
      stdout,
      /account: 2 vCPU · 4 GB memory · 20 GB storage · 1\/5 servers/,
    );
  });
});

test("analytics overview scopes by project and range alias", async () => {
  await withApi(async (apiUrl, seen) => {
    const { stdout } = await invoke(apiUrl, [
      "analytics",
      "--project",
      "prj_1",
      "--range",
      "7d",
    ]);
    assert.equal(seen[0]?.path, "/traffic/overview?range=7d&projectId=prj_1");
    assert.match(stdout, /Traffic · last 7 days · project prj_1/);
    assert.match(
      stdout,
      /900\s+3k\s+12k\s+4\s+0\.8% 5xx · 3\.3% 4xx\s+120ms\s+5\.0 MB/,
    );
    assert.match(stdout, /requests\s+▃█\s+\(1 h buckets\)/);
    assert.match(stdout, /20 scanner probes/);
  });
});

test("analytics top ranks a dimension and includes the remainder", async () => {
  await withApi(async (apiUrl) => {
    const { stdout } = await invoke(apiUrl, [
      "analytics",
      "top",
      "referrers",
      "--service",
      "svc_web",
      "--limit",
      "5",
    ]);
    assert.match(stdout, /Top referer · last 24 hours · service svc_web/);
    assert.match(stdout, /google\.com\s+80\s+█+▊\s+80%/);
    assert.match(stdout, /\(other\)\s+20/);
  });
});

test("analytics surfaces plan gating as a clear error", async () => {
  await withApi(async (apiUrl) => {
    await assert.rejects(
      invoke(apiUrl, ["analytics", "top", "page"]),
      /Traffic breakdowns require the Pro plan/,
    );
    await assert.rejects(
      invoke(apiUrl, ["analytics", "--range", "2w"]),
      /range must be one of 24h, 7d, 30d, 90d, 365d/,
    );
  });
});

test("without a terminal, missing ids and flags fail instead of prompting", async () => {
  await withApi(async (apiUrl, seen) => {
    await assert.rejects(
      invoke(apiUrl, ["apps", "scale"]),
      /missing required argument 'id'/,
    );
    await assert.rejects(
      invoke(apiUrl, ["apps", "deploy"]),
      /missing required argument 'id'/,
    );
    await assert.rejects(
      invoke(apiUrl, ["apps", "services", "create"]),
      /missing required argument 'projectId'/,
    );
    await assert.rejects(
      invoke(apiUrl, ["apps", "services", "create", "prj_1", "--name", "web"]),
      /required option '--repo <url>' not specified/,
    );
    await assert.rejects(
      invoke(apiUrl, ["db", "health"]),
      /missing required argument 'id'/,
    );
    await assert.rejects(
      invoke(apiUrl, ["auth", "switch"]),
      /missing required argument 'name'/,
    );
    assert.deepEqual(writes(seen), []);
  });
});

test("piped output stays free of color codes", async () => {
  await withApi(async (apiUrl) => {
    const { stdout } = await invoke(apiUrl, ["apps", "resources"]);
    assert.ok(!stdout.includes("\u001b["), "no ANSI escapes");
  });
});
