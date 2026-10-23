import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";

const execFileAsync = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const tsxImport = import.meta.resolve("tsx");

test("config plan and apply use immutable plan API contracts", async () => {
  const requests: { method: string; path: string; body: unknown }[] = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const raw = Buffer.concat(chunks).toString();
    requests.push({
      method: request.method ?? "",
      path: request.url ?? "",
      body: raw ? JSON.parse(raw) : undefined,
    });
    response.setHeader("content-type", "application/json");
    if (request.method === "GET")
      response.end(
        JSON.stringify({
          environmentId: "env_test",
          environmentName: "production",
          etag: "etag_before",
          state: {
            version: 1,
            project: { name: "Acme", env: {}, services: [] },
          },
        }),
      );
    else if (request.url?.endsWith("/plan"))
      response.end(
        JSON.stringify({
          planId: "plan_test",
          environmentId: "env_test",
          expiresAt: Date.now() + 60_000,
          destructive: false,
          summary: { add: 0, change: 1, destroy: 0, replace: 0 },
          changes: [
            {
              action: "change",
              address: "service.api.env.API_KEY",
              destructive: false,
              deploy: true,
              effect: "rebuild",
            },
          ],
          releases: [
            {
              serviceKey: "api",
              effect: "rebuild",
              liveDeploymentId: "dep_live",
              commitSha: "abc123",
              imageRef: null,
              pinned: true,
            },
          ],
        }),
      );
    else
      response.end(
        JSON.stringify({
          planId: "plan_test",
          environmentId: "env_test",
          expiresAt: Date.now() + 60_000,
          destructive: false,
          summary: { add: 0, change: 1, destroy: 0, replace: 0 },
          changes: [
            {
              action: "change",
              address: "service.api.env.API_KEY",
              destructive: false,
              deploy: true,
              effect: "rebuild",
            },
          ],
          releases: [
            {
              serviceKey: "api",
              effect: "rebuild",
              liveDeploymentId: "dep_live",
              commitSha: "abc123",
              imageRef: null,
              pinned: true,
            },
          ],
          applied: true,
          etag: "etag_after",
          deployments: [{ serviceId: "svc_api", slug: "api" }],
          deploymentSchedulingFailed: false,
        }),
      );
  });
  await new Promise<void>((resolveListen) =>
    server.listen(0, "127.0.0.1", resolveListen),
  );
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const apiUrl = `http://127.0.0.1:${address.port}`;
  const root = mkdtempSync(join(tmpdir(), "ubctl-iac-e2e-"));
  try {
    mkdirSync(join(root, ".unbroker"));
    writeFileSync(
      join(root, ".unbroker", "unbroker.ts"),
      `export default { evaluate: () => ({ version: 1, project: { name: "Acme", env: {}, services: [] } }) };\n`,
    );
    const planFile = join(root, "plan.json");
    await execFileAsync(
      process.execPath,
      [
        "--import",
        tsxImport,
        join(repoRoot, "src/index.ts"),
        "--api-url",
        apiUrl,
        "config",
        "plan",
        "prj_test",
        "--out",
        planFile,
        "--json",
      ],
      { cwd: root, env: { ...process.env, UBCTL_TOKEN: "ub_test" } },
    );
    assert.equal(
      JSON.parse(readFileSync(planFile, "utf8")).planId,
      "plan_test",
    );
    await assert.rejects(
      execFileAsync(
        process.execPath,
        [
          "--import",
          tsxImport,
          join(repoRoot, "src/index.ts"),
          "--api-url",
          apiUrl,
          "config",
          "apply",
          "prj_test",
          "--plan",
          planFile,
          "--json",
        ],
        { cwd: root, env: { ...process.env, UBCTL_TOKEN: "ub_test" } },
      ),
      (error: unknown) =>
        error instanceof Error &&
        /JSON apply requires --yes/.test(error.message),
    );
    const applied = await execFileAsync(
      process.execPath,
      [
        "--import",
        tsxImport,
        join(repoRoot, "src/index.ts"),
        "--api-url",
        apiUrl,
        "config",
        "apply",
        "prj_test",
        "--plan",
        planFile,
        "--yes",
      ],
      { cwd: root, env: { ...process.env, UBCTL_TOKEN: "ub_test" } },
    );
    assert.match(applied.stdout, /service\.api\.env\.API_KEY \(rebuild\)/);
    assert.match(applied.stdout, /api: rebuild abc123 \(pinned\)/);
    assert.match(applied.stdout, /Queued deployments: api/);
    assert.deepEqual(
      requests.map(({ method, path }) => ({ method, path })),
      [
        { method: "GET", path: "/apps/projects/prj_test/iac/state" },
        { method: "POST", path: "/apps/projects/prj_test/iac/plan" },
        { method: "POST", path: "/apps/projects/prj_test/iac/apply" },
      ],
    );
    assert.deepEqual(requests[2]?.body, {
      planId: "plan_test",
      confirmDestructive: false,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
    await new Promise<void>((resolveClose, reject) =>
      server.close((error) => (error ? reject(error) : resolveClose())),
    );
  }
});
