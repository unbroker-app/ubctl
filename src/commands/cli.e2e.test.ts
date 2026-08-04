import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

interface SeenRequest {
  method: string;
  path: string;
  body: unknown;
}

async function withApi(
  run: (apiUrl: string, seen: SeenRequest[]) => Promise<void>,
): Promise<void> {
  const seen: SeenRequest[] = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const raw = Buffer.concat(chunks).toString();
    seen.push({
      method: req.method ?? "",
      path: req.url ?? "",
      body: raw ? JSON.parse(raw) : undefined,
    });
    if (req.url === "/account") {
      res.writeHead(200, { "content-type": "application/json" });
      const token = req.headers["x-api-key"];
      const legacy = token === "ub_live_legacy";
      const alternate = token === "ub_account_b";
      res.end(
        JSON.stringify({
          account: legacy
            ? {
                uuid: "demo",
                name: "Demo User",
                email: "demo@unbroker.cloud",
                status: "active",
                team: { name: "Test Org", uuid: "org_test" },
              }
            : {
                uuid: `token:${alternate ? "org_b" : "org_test"}`,
                name: `API token (${alternate ? "account-b" : "ubctl-test"})`,
                email: "",
                status: "active",
                identityType: "api_token",
                tokenName: alternate ? "account-b" : "ubctl-test",
                team: alternate
                  ? { name: "Account B", uuid: "org_b" }
                  : { name: "Test Org", uuid: "org_test" },
              },
        }),
      );
      return;
    }
    if (req.url === "/profile") {
      const alternate = req.headers["x-api-key"] === "ub_account_b";
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          profile: {
            id: `token:${alternate ? "org_b" : "org_test"}`,
            name: `API token (${alternate ? "account-b" : "ubctl-test"})`,
            email: "",
            identityType: "api_token",
            tokenName: alternate ? "account-b" : "ubctl-test",
          },
          orgId: alternate ? "org_b" : "org_test",
        }),
      );
      return;
    }
    if (req.method === "POST" && req.url === "/databases") {
      res.writeHead(201, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          database: {
            id: "db_test",
            name: "test",
            engine: "pg",
            version: "16",
            status: "provisioning",
            region: "test1",
            nodes: 2,
            size: "small",
            storageGb: 20,
          },
        }),
      );
      return;
    }
    if (
      req.method === "POST" &&
      req.url === "/apps/projects/prj_test/services"
    ) {
      res.writeHead(201, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          service: {
            id: "svc_test",
            name: "test",
            url: "https://test.example",
            routed: true,
          },
        }),
      );
      return;
    }
    if (req.method === "POST" && req.url === "/apps/projects") {
      res.writeHead(201, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          project: { id: "prj_test", name: "test", slug: "test" },
        }),
      );
      return;
    }
    if (req.method === "POST" && req.url === "/apps/services/svc_test/env") {
      res.writeHead(201, { "content-type": "application/json" });
      res.end(JSON.stringify({ envVar: { key: "KEY", maskedValue: "***" } }));
      return;
    }
    if (
      req.method === "POST" &&
      req.url === "/apps/services/svc_test/domains"
    ) {
      res.writeHead(201, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          domain: { hostname: "app.example.test", status: "pending" },
        }),
      );
      return;
    }
    if (
      req.method === "POST" &&
      req.url === "/apps/services/svc_test/deployments"
    ) {
      res.writeHead(202, { "content-type": "application/json" });
      res.end(
        JSON.stringify({ deployment: { id: "dep_test", status: "queued" } }),
      );
      return;
    }
    if (req.method === "POST" && req.url === "/beacon/projects") {
      res.writeHead(201, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          project: { id: "bcn_test", name: "test", status: "active" },
        }),
      );
      return;
    }
    if (req.method === "POST" && req.url === "/api-tokens") {
      res.writeHead(201, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          token: { id: "tok_test", name: "test", scope: "read" },
          secret: "ub_secret",
        }),
      );
      return;
    }
    if (req.url?.startsWith("/apps/services/svc_test/metrics/history")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          metrics: [
            {
              capturedAt: 1,
              readyReplicas: 1,
              desiredReplicas: 1,
              cpuMillicores: 12,
              memoryMiB: 34,
              restarts: 0,
              unhealthyPods: 0,
            },
          ],
        }),
      );
      return;
    }
    if (req.url?.startsWith("/apps/services/svc_test/logs/history")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          logs: [{ id: "log", observedAt: 1, line: "hello" }],
          retentionMs: 1000,
        }),
      );
      return;
    }
    if (req.url === "/apps/services/svc_test/tls") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ready: true }));
      return;
    }
    if (req.url === "/apps/services/svc_test/domains" && req.method === "GET") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ domains: [] }));
      return;
    }
    if (req.url === "/account/current-charges") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          charges: {
            cycle: {
              start: 1,
              end: 2,
              nextChargeAt: 3,
              daysInCycle: 30,
              dayOfCycle: 1,
            },
            items: [],
            ledger: 0,
            accruedTotal: 1,
            projectedTotal: 2,
          },
        }),
      );
      return;
    }
    if (req.url?.startsWith("/account/usage-breakdown")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          usage: {
            month: "2026-08",
            current: true,
            products: [],
            credit: { included: 10, used: 1 },
            onDemand: 0,
            accrued: 1,
            projected: 2,
            availableMonths: ["2026-08"],
          },
        }),
      );
      return;
    }
    if (req.url?.startsWith("/account/cli-usage")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          usage: {
            since: "2026-08-01",
            requests: 3,
            errors: 0,
            errorRate: 0,
            averageLatencyMs: 10,
            byVersion: [{ version: "0.4.0", requests: 3 }],
            byRoute: [],
          },
        }),
      );
      return;
    }
    if (req.url === "/billing/budget" && req.method === "GET") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({ budget: null, spend: { accrued: 1, projected: 2 } }),
      );
      return;
    }
    if (req.url === "/monitoring/policies") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ policies: [] }));
      return;
    }
    if (req.method === "POST" && req.url === "/team") {
      res.writeHead(201, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          invitation: {
            id: "inv_test",
            email: "qa@example.test",
            role: "Member",
          },
        }),
      );
      return;
    }
    if (
      (req.method === "POST" &&
        ["/notifications/read", "/droplets/drop_test/reboot"].includes(
          req.url ?? "",
        )) ||
      (req.method === "DELETE" && req.url === "/apps/github/installations/1")
    ) {
      res.writeHead(204);
      res.end();
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: { code: "not_found", message: "unexpected route" },
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    await run(`http://127.0.0.1:${address.port}`, seen);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
}

async function invoke(apiUrl: string, args: string[], token = "ub_test") {
  const config = mkdtempSync(join(tmpdir(), "ubctl-cli-e2e-"));
  try {
    return await execFileAsync(
      process.execPath,
      ["--import", "tsx", "src/index.ts", ...args],
      {
        cwd: repoRoot,
        timeout: 5_000,
        env: {
          ...process.env,
          XDG_CONFIG_HOME: config,
          UBCTL_API_URL: apiUrl,
          UBCTL_TOKEN: token,
          UBCTL_ORG: "org_test",
        },
      },
    );
  } finally {
    rmSync(config, { recursive: true, force: true });
  }
}

async function invokePersisted(apiUrl: string, config: string, args: string[]) {
  return execFileAsync(
    process.execPath,
    ["--import", "tsx", "src/index.ts", ...args],
    {
      cwd: repoRoot,
      timeout: 5_000,
      env: {
        ...process.env,
        XDG_CONFIG_HOME: config,
        UBCTL_API_URL: apiUrl,
        UBCTL_TOKEN: undefined,
        UBCTL_ORG: undefined,
      },
    },
  );
}

test("db create uses --engine-version and sends validated numeric values", async () => {
  await withApi(async (apiUrl, seen) => {
    const result = await invoke(apiUrl, [
      "db",
      "create",
      "--name",
      "test",
      "--engine",
      "pg",
      "--engine-version",
      "16",
      "--region",
      "test1",
      "--size",
      "small",
      "--nodes",
      "2",
      "--storage",
      "20",
      "--price",
      "10.5",
      "--json",
    ]);

    assert.match(result.stdout, /"id": "db_test"/);
    assert.deepEqual(seen, [
      {
        method: "POST",
        path: "/databases",
        body: {
          name: "test",
          engine: "pg",
          version: "16",
          region: "test1",
          size: "small",
          num_nodes: 2,
          storageGb: 20,
          pricePerMo: 10.5,
        },
      },
    ]);
  });
});

test("db create keeps the documented v0.1 --version spelling compatible", async () => {
  await withApi(async (apiUrl, seen) => {
    const result = await invoke(apiUrl, [
      "db",
      "create",
      "--name",
      "legacy",
      "--engine",
      "pg",
      "--version",
      "16",
      "--region",
      "test1",
      "--size",
      "small",
      "--json",
    ]);
    assert.match(result.stdout, /"id": "db_test"/);
    assert.equal(seen.length, 1);
    assert.equal((seen[0]!.body as { version: string }).version, "16");
  });
});

test("whoami labels an org-scoped API token without a demo account", async () => {
  await withApi(async (apiUrl) => {
    const result = await invoke(apiUrl, ["whoami"]);
    assert.match(result.stdout, /Identity: API token "ubctl-test"/);
    assert.doesNotMatch(result.stdout, /Demo User/);
    assert.match(result.stdout, /Test Org \(org_test\)/);
  });
});

test("observability and billing reads use their production API contracts", async () => {
  await withApi(async (apiUrl, seen) => {
    await invoke(apiUrl, [
      "apps",
      "services",
      "metrics",
      "svc_test",
      "--since",
      "1h",
      "--json",
    ]);
    await invoke(apiUrl, [
      "apps",
      "services",
      "logs",
      "svc_test",
      "--since",
      "30m",
      "--json",
    ]);
    await invoke(apiUrl, ["apps", "domains", "status", "svc_test", "--json"]);
    await invoke(apiUrl, ["account", "charges", "--json"]);
    await invoke(apiUrl, ["account", "usage", "--breakdown", "--json"]);
    await invoke(apiUrl, ["account", "cli-usage", "--json"]);
    await invoke(apiUrl, ["billing", "budget", "get", "--json"]);
    await invoke(apiUrl, ["monitoring", "ls", "--json"]);
    assert.equal(seen.length, 9);
    assert.ok(
      seen.some((request) =>
        request.path.startsWith(
          "/apps/services/svc_test/metrics/history?since=",
        ),
      ),
    );
    assert.ok(
      seen.some((request) => request.path === "/account/current-charges"),
    );
    assert.ok(seen.some((request) => request.path === "/monitoring/policies"));
  });
});

test("login renders a compact authenticated panel", async () => {
  await withApi(async (apiUrl, seen) => {
    const result = await invoke(apiUrl, ["login", "--token", "ub_test"]);
    assert.match(result.stdout, /UNBROKER CLOUD/);
    assert.match(result.stdout, /✓ Authenticated/);
    assert.match(result.stdout, /API token "ubctl-test"/);
    assert.match(result.stdout, /Org\s+org_test/);
    assert.match(result.stdout, /Next: ubctl apps projects ls/);
    assert.equal(seen[0]?.path, "/profile");
  });
});

test("login --json remains machine-readable", async () => {
  await withApi(async (apiUrl) => {
    const result = await invoke(apiUrl, [
      "--json",
      "login",
      "--token",
      "ub_test",
    ]);
    const response = JSON.parse(result.stdout);
    assert.equal(response.authenticated, true);
    assert.equal(response.identity, 'API token "ubctl-test"');
    assert.equal(response.orgId, "org_test");
    assert.equal(response.apiUrl, apiUrl);
  });
});

test("login --context keeps multiple accounts isolated and switchable", async () => {
  await withApi(async (apiUrl) => {
    const config = mkdtempSync(join(tmpdir(), "ubctl-context-e2e-"));
    try {
      await invokePersisted(apiUrl, config, [
        "login",
        "--token",
        "ub_account_a",
        "--context",
        "account-a",
      ]);
      await assert.rejects(
        invokePersisted(apiUrl, config, ["login", "--token", "ub_account_b"]),
        /use --context <name>/,
      );
      await invokePersisted(apiUrl, config, [
        "login",
        "--token",
        "ub_account_b",
        "--context",
        "account-b",
      ]);

      const stored = JSON.parse(
        readFileSync(join(config, "ubctl", "config.json"), "utf8"),
      );
      assert.equal(stored.contexts["account-a"].token, "ub_account_a");
      assert.equal(stored.contexts["account-a"].org, "org_test");
      assert.equal(stored.contexts["account-b"].token, "ub_account_b");
      assert.equal(stored.contexts["account-b"].org, "org_b");

      await invokePersisted(apiUrl, config, ["auth", "switch", "account-a"]);
      const first = await invokePersisted(apiUrl, config, ["whoami", "--json"]);
      assert.equal(JSON.parse(first.stdout).team.uuid, "org_test");
      await invokePersisted(apiUrl, config, ["auth", "switch", "account-b"]);
      const second = await invokePersisted(apiUrl, config, [
        "whoami",
        "--json",
      ]);
      assert.equal(JSON.parse(second.stdout).team.uuid, "org_b");
    } finally {
      rmSync(config, { recursive: true, force: true });
    }
  });
});

test("whoami normalizes a legacy Demo User token response in text and JSON", async () => {
  await withApi(async (apiUrl) => {
    const text = await invoke(apiUrl, ["whoami"], "ub_live_legacy");
    assert.match(text.stdout, /Identity: Organization API token/);
    assert.doesNotMatch(text.stdout, /Demo User/);

    const json = await invoke(apiUrl, ["whoami", "--json"], "ub_live_legacy");
    const account = JSON.parse(json.stdout);
    assert.equal(account.identityType, "api_token");
    assert.equal(account.name, "Organization API token");
    assert.equal(account.email, "");
  });
});

test("invalid numeric options fail before an HTTP request", async () => {
  await withApi(async (apiUrl, seen) => {
    await assert.rejects(
      invoke(apiUrl, [
        "apps",
        "services",
        "update",
        "svc_test",
        "--port",
        "abc",
      ]),
      /port must be an integer/,
    );
    await assert.rejects(
      invoke(apiUrl, [
        "apps",
        "services",
        "create",
        "prj_test",
        "--name",
        "test",
        "--repo",
        "https://github.com/acme/test",
        "--framework",
        "node",
        "--port",
        "abc",
      ]),
      /port must be an integer/,
    );
    await assert.rejects(
      invoke(apiUrl, [
        "apps",
        "deploy",
        "svc_test",
        "--wait",
        "--timeout",
        "abc",
      ]),
      /timeout must be a positive decimal number/,
    );
    assert.equal(seen.length, 0);
  });
});

test("service creation accepts supported repository hosts and worker framework", async () => {
  await withApi(async (apiUrl, seen) => {
    await invoke(apiUrl, [
      "apps",
      "services",
      "create",
      "prj_test",
      "--name",
      "test",
      "--repo",
      "https://gitlab.com/acme/test.git",
      "--framework",
      "worker",
      "--json",
    ]);
    assert.equal(seen.length, 1);
    assert.deepEqual(seen[0]!.body, {
      name: "test",
      repoUrl: "https://gitlab.com/acme/test",
      branch: "main",
      framework: "worker",
    });
  });
});

test("invalid repository URLs fail before an HTTP request", async () => {
  await withApi(async (apiUrl, seen) => {
    await assert.rejects(
      invoke(apiUrl, [
        "apps",
        "services",
        "create",
        "prj_test",
        "--name",
        "test",
        "--repo",
        "https://user:secret@github.com/acme/test",
        "--framework",
        "node",
      ]),
      /repo must be an HTTPS/,
    );
    assert.equal(seen.length, 0);
  });
});

test("contradictory access flags fail before mutation", async () => {
  await withApi(async (apiUrl, seen) => {
    await assert.rejects(
      invoke(apiUrl, [
        "apps",
        "services",
        "security",
        "svc_test",
        "--mode",
        "public",
        "--password",
        "unused",
      ]),
      /--password is only valid/,
    );
    await assert.rejects(
      invoke(apiUrl, [
        "apps",
        "services",
        "security",
        "svc_test",
        "--mode",
        "password",
      ]),
      /password mode requires --password/,
    );
    await assert.rejects(
      invoke(apiUrl, [
        "beacon",
        "settings",
        "set",
        "bcn_test",
        "--allow-anonymous",
        "--disallow-anonymous",
      ]),
      /mutually exclusive/,
    );
    assert.equal(seen.length, 0);
  });
});

test("representative mutations route every command family correctly", async () => {
  await withApi(async (apiUrl, seen) => {
    const commands = [
      ["apps", "projects", "create", "--name", "test", "--json"],
      ["apps", "env", "set", "svc_test", "KEY", "value"],
      ["apps", "domains", "add", "svc_test", "app.example.test", "--json"],
      ["apps", "deploy", "svc_test", "--json"],
      ["beacon", "create", "--name", "test", "--json"],
      ["github", "installations", "rm", "1"],
      ["tokens", "create", "--name", "test", "--scope", "read", "--json"],
      ["team", "invite", "qa@example.test", "--json"],
      ["notifications", "read"],
      ["droplets", "reboot", "drop_test"],
    ];
    for (const command of commands) await invoke(apiUrl, command);

    assert.deepEqual(
      seen.map(({ method, path }) => `${method} ${path}`),
      [
        "POST /apps/projects",
        "POST /apps/services/svc_test/env",
        "POST /apps/services/svc_test/domains",
        "POST /apps/services/svc_test/deployments",
        "POST /beacon/projects",
        "DELETE /apps/github/installations/1",
        "POST /api-tokens",
        "POST /team",
        "POST /notifications/read",
        "POST /droplets/drop_test/reboot",
      ],
    );
  });
});
