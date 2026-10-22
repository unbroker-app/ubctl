import assert from "node:assert/strict";
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import ts from "typescript";
import {
  evaluateConfig,
  findConfigPath,
  readPlanId,
  renderConfig,
  writeConfig,
  type EvaluationContext,
} from "./iac";

const context: EvaluationContext = {
  command: "plan",
  projectId: "prj_test",
  projectName: "Acme",
  environmentId: "env_test",
  environment: "production",
  environmentName: "production",
  isEnvironment: (name) => name === "production",
};

test("findConfigPath walks parents and explicit paths fail clearly", () => {
  const root = mkdtempSync(join(tmpdir(), "ubctl-iac-"));
  try {
    const nested = join(root, "apps", "web");
    mkdirSync(nested, { recursive: true });
    const file = join(root, ".unbroker", "unbroker.ts");
    writeConfig(file, "export default {};\n");
    assert.equal(findConfigPath(undefined, nested), file);
    assert.throws(() => findConfigPath("missing.ts", root), /not found/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("evaluateConfig loads TypeScript and passes environment context", async () => {
  const root = mkdtempSync(join(tmpdir(), "ubctl-iac-"));
  try {
    const file = join(root, "unbroker.ts");
    writeFileSync(
      file,
      `export default {
  evaluate(ctx: { projectName: string; environment: string }) {
    return { version: 1, project: { name: ctx.projectName + "-" + ctx.environment, env: {}, services: [] } };
  }
};\n`,
    );
    const state = await evaluateConfig(file, context);
    assert.equal(state.project.name, "Acme-production");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("renderConfig preserves sealed variables and logical references", () => {
  const source = renderConfig({
    version: 1,
    project: {
      name: "Acme",
      env: { TOKEN: { $unbroker: "preserve" } },
      services: [
        {
          key: "api",
          name: "API",
          source: {
            type: "repository",
            url: "https://github.com/acme/api",
            branch: "main",
            framework: "node",
          },
          build: null,
          preDeploy: null,
          start: "npm start",
          outputDir: null,
          port: 3000,
          healthcheck: null,
          replicas: 1,
          cpuLimit: null,
          memoryLimit: null,
          autoDeploy: true,
          waitForCi: false,
          prPreviews: false,
          volume: null,
          env: { DB_HOST: "${{services.db.host}}" },
          domains: [],
        },
      ],
    },
  });
  assert.match(source, /TOKEN: preserve\(\)/);
  assert.match(source, /\$\{\{services\.db\.host\}\}/);
  assert.match(source, /service\("api"/);
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext },
    reportDiagnostics: true,
  });
  assert.deepEqual(transpiled.diagnostics, []);
});

test("readPlanId accepts ids and validates artifacts", () => {
  const root = mkdtempSync(join(tmpdir(), "ubctl-iac-"));
  try {
    assert.equal(readPlanId("plan_direct", root), "plan_direct");
    const file = join(root, "plan.json");
    writeFileSync(file, JSON.stringify({ planId: "plan_saved" }));
    assert.equal(readPlanId(file), "plan_saved");
    writeFileSync(file, "{}");
    assert.throws(() => readPlanId(file), /missing planId/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("writeConfig refuses accidental replacement", () => {
  const root = mkdtempSync(join(tmpdir(), "ubctl-iac-"));
  try {
    const file = join(root, "config.ts");
    writeConfig(file, "one");
    assert.throws(() => writeConfig(file, "two"), /already exists/);
    chmodSync(file, 0o644);
    writeConfig(file, "two", true);
    assert.equal(statSync(file).mode & 0o777, 0o600);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
