import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

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
      res.end(
        JSON.stringify({
          account: {
            uuid: "token:org_test",
            name: "API token (ubctl-test)",
            email: "",
            status: "active",
            identityType: "api_token",
            tokenName: "ubctl-test",
            team: { name: "Test Org", uuid: "org_test" },
          },
        }),
      );
      return;
    }
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

async function invoke(apiUrl: string, args: string[]) {
  const config = mkdtempSync(join(tmpdir(), "ubctl-cli-e2e-"));
  try {
    return await execFileAsync(
      process.execPath,
      ["--import", "tsx", "src/index.ts", ...args],
      {
        cwd: process.cwd(),
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

test("whoami labels an org-scoped API token without a demo account", async () => {
  await withApi(async (apiUrl) => {
    const result = await invoke(apiUrl, ["whoami"]);
    assert.match(result.stdout, /Identity: API token "ubctl-test"/);
    assert.doesNotMatch(result.stdout, /Demo User/);
    assert.match(result.stdout, /Test Org \(org_test\)/);
  });
});

test("invalid numeric options fail before an HTTP request", async () => {
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
      /timeout must be a positive number/,
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
