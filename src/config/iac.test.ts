import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import ts from "typescript";
import { buildProgram } from "../program";
import {
  evaluateConfig,
  findConfigPath,
  goModule,
  newConfigPath,
  readPlanId,
  renderConfig,
  starterConfig,
  writeConfig,
  type EvaluationContext,
  type DesiredState,
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

test("config pull renders explicit private and public settings in every language", () => {
  for (const privateValue of [undefined, true, false]) {
    const state: DesiredState = {
      version: 1,
      project: {
        name: "acme",
        env: {},
        services: [
          {
            key: "api",
            name: "api",
            source: {
              type: "image",
              ref: "nginx:alpine",
              public: privateValue === false,
            },
            ...(privateValue !== undefined ? { private: privateValue } : {}),
            build: null,
            preDeploy: null,
            start: null,
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
            env: {},
            domains: [],
          },
        ],
      },
    };
    for (const language of ["typescript", "python", "go"] as const) {
      const rendered = renderConfig(state, language);
      if (privateValue === undefined)
        assert.doesNotMatch(rendered, /private:|private=|Private:/);
      else {
        const expected =
          language === "typescript"
            ? `private: ${privateValue}`
            : language === "python"
              ? `private=${privateValue ? "True" : "False"}`
              : `Private: iac.Bool(${privateValue})`;
        assert.ok(rendered.includes(expected), rendered);
      }
    }
  }
});

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

test("findConfigPath rejects ambiguous language files", () => {
  const root = mkdtempSync(join(tmpdir(), "ubctl-iac-"));
  try {
    writeConfig(join(root, ".unbroker", "unbroker.ts"), "export default {};\n");
    writeConfig(join(root, ".unbroker", "unbroker.py"), "print('{}')\n");
    assert.throws(
      () => findConfigPath(undefined, root),
      /multiple IaC configurations/,
    );
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

test("evaluateConfig runs the Python stdin/stdout protocol", async () => {
  const root = mkdtempSync(join(tmpdir(), "ubctl-iac-"));
  try {
    const file = join(root, "unbroker.py");
    writeFileSync(
      file,
      `import json, sys
ctx = json.load(sys.stdin)
json.dump({"version": 1, "project": {"name": ctx["projectName"] + "-py", "env": {}, "services": []}}, sys.stdout)
`,
    );
    const state = await evaluateConfig(file, context);
    assert.equal(state.project.name, "Acme-py");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test(
  "evaluateConfig runs the Go stdin/stdout protocol",
  { skip: spawnSync("go", ["version"]).status !== 0 },
  async () => {
    const root = mkdtempSync(join(tmpdir(), "ubctl-iac-"));
    try {
      writeFileSync(join(root, "go.mod"), "module evaluator\n\ngo 1.22\n");
      const file = join(root, "unbroker.go");
      writeFileSync(
        file,
        `package main
import ("encoding/json"; "os")
func main() {
  var ctx map[string]any
  json.NewDecoder(os.Stdin).Decode(&ctx)
  json.NewEncoder(os.Stdout).Encode(map[string]any{"version": 1, "project": map[string]any{"name": ctx["projectName"].(string) + "-go", "env": map[string]any{}, "services": []any{}}})
}
`,
      );
      // The explicit --file runner must not compile or execute sibling Go files.
      writeFileSync(
        join(root, "sibling.go"),
        `package main
func main() { panic("sibling should not run") }
`,
      );
      const state = await evaluateConfig(file, context);
      assert.equal(state.project.name, "Acme-go");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

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

test("renderConfig and starters support all authoring languages", () => {
  const state = {
    version: 1 as const,
    project: { name: "Acme", env: {}, services: [] },
  };
  assert.match(renderConfig(state, "python"), /def configuration\(ctx\)/);
  assert.match(renderConfig(state, "go"), /iac\.Run\(configuration\)/);
  assert.match(starterConfig("typescript"), /defineUnbroker/);
  assert.match(starterConfig("python"), /define_unbroker/);
  assert.match(starterConfig("go"), /DefineUnbroker/);
  assert.match(goModule, /github\.com\/unbroker-app\/iac v0\.3\.0/);
  assert.match(newConfigPath("/tmp/project", "python"), /unbroker\.py$/);
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

test("config init --force never overwrites an existing go.mod", async () => {
  const root = mkdtempSync(join(tmpdir(), "ubctl-iac-"));
  try {
    const file = join(root, "unbroker.go");
    const goMod = join(root, "go.mod");
    writeFileSync(file, "package main\nfunc main() {}\n");
    writeFileSync(goMod, "module existing-project\n\ngo 1.23\n");
    await buildProgram().parseAsync([
      "node",
      "ubctl",
      "config",
      "init",
      "--lang",
      "go",
      "--file",
      file,
      "--force",
    ]);
    assert.equal(
      readFileSync(goMod, "utf8"),
      "module existing-project\n\ngo 1.23\n",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
