import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { spawn } from "node:child_process";
import { dirname, extname, isAbsolute, join, resolve } from "node:path";
import { createJiti } from "jiti";
import { CliError } from "../util/errors";

export interface PreserveValue {
  $unbroker: "preserve";
}

export type VariableValue = string | PreserveValue;

export interface DesiredService {
  key: string;
  name: string;
  private?: boolean;
  source:
    | {
        type: "repository";
        url: string;
        branch: string;
        framework?: string;
        dockerfilePath?: string;
        rootDir?: string;
      }
    | { type: "image"; ref: string; public: boolean };
  build: string | null;
  preDeploy: string | null;
  start: string | null;
  outputDir: string | null;
  port: number;
  healthcheck: string | null;
  replicas: number;
  cpuLimit: number | null;
  memoryLimit: number | null;
  autoDeploy: boolean;
  waitForCi: boolean;
  prPreviews: boolean;
  volume: { path: string; sizeGb: number } | null;
  env: Record<string, VariableValue>;
  domains: string[];
}

export interface DesiredState {
  version: 1;
  project: {
    name: string;
    env: Record<string, VariableValue>;
    services: DesiredService[];
  };
}

export interface EvaluationContext {
  command: "pull" | "plan" | "apply";
  projectId: string;
  projectName: string;
  environmentId: string;
  environment: string;
  environmentName: string;
  isEnvironment(name: string): boolean;
}

export type IacLanguage = "typescript" | "python" | "go";

interface Configuration {
  evaluate(context: EvaluationContext): DesiredState;
}

const CONFIG_NAMES = [
  "unbroker.ts",
  "unbroker.js",
  "unbroker.mjs",
  "unbroker.py",
  "unbroker.go",
];
const EVALUATOR_TIMEOUT_MS = 30_000;
const EVALUATOR_MAX_BYTES = 1024 * 1024;

export function configLanguage(value: string): IacLanguage {
  if (value === "typescript" || value === "python" || value === "go")
    return value;
  throw new CliError("language must be typescript, python or go");
}

export function languageForFile(file: string): IacLanguage {
  const extension = extname(file);
  if (extension === ".py") return "python";
  if (extension === ".go") return "go";
  if (extension === ".ts" || extension === ".js" || extension === ".mjs")
    return "typescript";
  throw new CliError(`unsupported IaC configuration extension: ${extension}`);
}

export function newConfigPath(
  cwd = process.cwd(),
  language: IacLanguage = "typescript",
): string {
  const extension =
    language === "typescript" ? "ts" : language === "python" ? "py" : "go";
  return join(cwd, ".unbroker", `unbroker.${extension}`);
}

export function findConfigPath(file?: string, cwd = process.cwd()): string {
  if (file) {
    const explicit = isAbsolute(file) ? file : resolve(cwd, file);
    if (!existsSync(explicit))
      throw new CliError(`config file not found: ${file}`);
    return explicit;
  }
  let directory = resolve(cwd);
  while (true) {
    const matches = CONFIG_NAMES.map((name) =>
      join(directory, ".unbroker", name),
    ).filter(existsSync);
    if (matches.length > 1)
      throw new CliError(
        `multiple IaC configurations found in ${join(directory, ".unbroker")}; keep exactly one`,
      );
    if (matches.length === 1) return matches[0]!;
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  throw new CliError(
    "no .unbroker/unbroker.{ts,py,go} found; run `ubctl config init` or pass --file",
  );
}

export async function evaluateConfig(
  file: string,
  context: EvaluationContext,
): Promise<DesiredState> {
  const language = languageForFile(file);
  if (language !== "typescript")
    return evaluateExternal(file, context, language);
  let loaded: unknown;
  try {
    const jiti = createJiti(import.meta.url, { interopDefault: false });
    loaded = await jiti.import(file);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new CliError(`cannot evaluate ${file}: ${detail}`);
  }
  const module = loaded as { default?: unknown };
  const candidate = module?.default ?? loaded;
  if (
    !candidate ||
    typeof candidate !== "object" ||
    !("evaluate" in candidate) ||
    typeof candidate.evaluate !== "function"
  )
    throw new CliError(
      `${file} must default-export defineUnbroker((ctx) => project(...))`,
    );
  try {
    return (candidate as Configuration).evaluate(context);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new CliError(`invalid Unbroker configuration: ${detail}`);
  }
}

function validateEvaluatorOutput(file: string, value: unknown): DesiredState {
  if (
    !value ||
    typeof value !== "object" ||
    (value as { version?: unknown }).version !== 1 ||
    !Array.isArray(
      (value as { project?: { services?: unknown } }).project?.services,
    )
  )
    throw new CliError(
      `${file} did not emit an Unbroker desired-state v1 document`,
    );
  return value as DesiredState;
}

async function evaluateExternal(
  file: string,
  context: EvaluationContext,
  language: Exclude<IacLanguage, "typescript">,
): Promise<DesiredState> {
  const command =
    language === "python"
      ? (process.env.UBCTL_PYTHON ?? "python3")
      : (process.env.UBCTL_GO ?? "go");
  const args = language === "python" ? [file] : ["run", file];
  const cwd = dirname(file);
  const result = await runEvaluator(
    command,
    args,
    cwd,
    JSON.stringify(context),
  );
  if (result.stderr) process.stderr.write(result.stderr);
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    throw new CliError(`${file} emitted invalid JSON on stdout`);
  }
  return validateEvaluatorOutput(file, parsed);
}

function runEvaluator(
  command: string,
  args: string[],
  cwd: string,
  input: string,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd,
      detached: process.platform !== "win32",
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    const finishError = (message: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (child.pid && process.platform !== "win32") {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          child.kill("SIGKILL");
        }
      } else child.kill("SIGKILL");
      rejectRun(new CliError(message));
    };
    const timer = setTimeout(
      () =>
        finishError(`IaC evaluator exceeded ${EVALUATOR_TIMEOUT_MS / 1000}s`),
      EVALUATOR_TIMEOUT_MS,
    );
    child.on("error", (error) =>
      finishError(`cannot start ${command}: ${error.message}`),
    );
    child.stdin.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code !== "EPIPE")
        finishError(`cannot send context to ${command}: ${error.message}`);
    });
    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > EVALUATOR_MAX_BYTES)
        return finishError("IaC evaluator stdout exceeded 1 MiB");
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.length;
      if (stderrBytes > EVALUATOR_MAX_BYTES)
        return finishError("IaC evaluator stderr exceeded 1 MiB");
      stderr.push(chunk);
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const stderrText = Buffer.concat(stderr).toString();
      if (code !== 0)
        return rejectRun(
          new CliError(
            `IaC evaluator failed${signal ? ` (${signal})` : ` (exit ${code ?? "unknown"})`}${stderrText ? `: ${stderrText.trim()}` : ""}`,
          ),
        );
      resolveRun({
        stdout: Buffer.concat(stdout).toString(),
        stderr: stderrText,
      });
    });
    child.stdin.end(input);
  });
}

export function writeConfig(
  file: string,
  contents: string,
  force = false,
): void {
  if (existsSync(file) && !force)
    throw new CliError(`${file} already exists; pass --force to replace it`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, contents, { encoding: "utf8", mode: 0o600 });
  chmodSync(file, 0o600);
}

export function readPlanId(value: string, cwd = process.cwd()): string {
  const path = isAbsolute(value) ? value : resolve(cwd, value);
  if (!existsSync(path)) return value;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as {
      planId?: unknown;
    };
    if (typeof parsed.planId !== "string" || !parsed.planId)
      throw new Error("missing planId");
    return parsed.planId;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new CliError(`cannot read plan artifact ${value}: ${detail}`);
  }
}

const js = (value: string): string => JSON.stringify(value);
const property = (key: string): string =>
  /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : js(key);
const variableValue = (value: VariableValue): string =>
  typeof value === "string" ? js(value) : "preserve()";
const envObject = (
  env: Record<string, VariableValue>,
  indent: string,
): string => {
  const entries = Object.entries(env);
  if (!entries.length) return "{}";
  return `{\n${entries
    .map(
      ([key, value]) => `${indent}  ${property(key)}: ${variableValue(value)},`,
    )
    .join("\n")}\n${indent}}`;
};

function renderTypeScriptConfig(state: DesiredState): string {
  const lines = [
    'import { defineUnbroker, image, preserve, project, repository, service, volume } from "@unbroker/iac";',
    "",
    "export default defineUnbroker(() => {",
  ];
  const resources: string[] = [];
  state.project.services.forEach((serviceSpec, index) => {
    const serviceVar = `service${index + 1}`;
    let volumeVar: string | undefined;
    if (serviceSpec.volume) {
      volumeVar = `volume${index + 1}`;
      const volumeKey = `${serviceSpec.key.slice(0, 43).replace(/-+$/, "")}-volume`;
      lines.push(
        `  const ${volumeVar} = volume(${js(volumeKey)}, { sizeGb: ${serviceSpec.volume.sizeGb} });`,
      );
      resources.push(volumeVar);
    }
    const source =
      serviceSpec.source.type === "image"
        ? `image(${js(serviceSpec.source.ref)}${serviceSpec.source.public ? ", { public: true }" : ""})`
        : `repository(${js(serviceSpec.source.url)}, ${JSON.stringify(
            Object.fromEntries(
              Object.entries({
                branch: serviceSpec.source.branch,
                framework: serviceSpec.source.framework,
                dockerfilePath: serviceSpec.source.dockerfilePath,
                rootDir: serviceSpec.source.rootDir,
              }).filter(([, value]) => value !== undefined),
            ),
          )})`;
    const fields = [
      `name: ${js(serviceSpec.name)}`,
      `source: ${source}`,
      serviceSpec.private !== undefined
        ? `private: ${serviceSpec.private}`
        : null,
      serviceSpec.build != null ? `build: ${js(serviceSpec.build)}` : null,
      serviceSpec.preDeploy != null
        ? `preDeploy: ${js(serviceSpec.preDeploy)}`
        : null,
      serviceSpec.start != null ? `start: ${js(serviceSpec.start)}` : null,
      serviceSpec.outputDir != null
        ? `outputDir: ${js(serviceSpec.outputDir)}`
        : null,
      `port: ${serviceSpec.port}`,
      serviceSpec.healthcheck != null
        ? `healthcheck: ${js(serviceSpec.healthcheck)}`
        : null,
      serviceSpec.replicas !== 1 ? `replicas: ${serviceSpec.replicas}` : null,
      serviceSpec.cpuLimit != null ? `cpuLimit: ${serviceSpec.cpuLimit}` : null,
      serviceSpec.memoryLimit != null
        ? `memoryLimit: ${serviceSpec.memoryLimit}`
        : null,
      !serviceSpec.autoDeploy ? "autoDeploy: false" : null,
      serviceSpec.waitForCi ? "waitForCi: true" : null,
      serviceSpec.prPreviews ? "prPreviews: true" : null,
      serviceSpec.volume && volumeVar
        ? `volume: ${volumeVar}.mount(${js(serviceSpec.volume.path)})`
        : null,
      Object.keys(serviceSpec.env).length
        ? `env: ${envObject(serviceSpec.env, "    ")}`
        : null,
      serviceSpec.domains.length
        ? `domains: ${JSON.stringify(serviceSpec.domains)}`
        : null,
    ].filter((field): field is string => field !== null);
    lines.push(`  const ${serviceVar} = service(${js(serviceSpec.key)}, {`);
    for (const field of fields) {
      const fieldLines = field.split("\n");
      lines.push(`    ${fieldLines[0]}`);
      for (const continuation of fieldLines.slice(1)) lines.push(continuation);
      lines[lines.length - 1] += ",";
    }
    lines.push("  });");
    resources.push(serviceVar);
  });
  lines.push(
    "",
    `  return project(${js(state.project.name)}, {`,
    `    resources: [${resources.join(", ")}],`,
  );
  if (Object.keys(state.project.env).length)
    lines.push(`    env: ${envObject(state.project.env, "    ")},`);
  lines.push("  });", "});", "");
  return lines.join("\n");
}

const pyValue = (value: VariableValue): string =>
  typeof value === "string" ? js(value) : "preserve()";
const pyDict = (env: Record<string, VariableValue>): string =>
  `{${Object.entries(env)
    .map(([key, value]) => `${js(key)}: ${pyValue(value)}`)
    .join(", ")}}`;

function renderPythonConfig(state: DesiredState): string {
  const lines = [
    "from unbroker_iac import define_unbroker, image, preserve, project, repository, run, service, volume",
    "",
    "@define_unbroker",
    "def configuration(ctx):",
  ];
  const resources: string[] = [];
  state.project.services.forEach((spec, index) => {
    const serviceVar = `service_${index + 1}`;
    let volumeVar: string | undefined;
    if (spec.volume) {
      volumeVar = `volume_${index + 1}`;
      const key = `${spec.key.slice(0, 43).replace(/-+$/, "")}-volume`;
      lines.push(
        `    ${volumeVar} = volume(${js(key)}, size_gb=${spec.volume.sizeGb})`,
      );
      resources.push(volumeVar);
    }
    const source =
      spec.source.type === "image"
        ? `image(${js(spec.source.ref)}, public=${spec.source.public ? "True" : "False"})`
        : `repository(${js(spec.source.url)}, branch=${js(spec.source.branch)},${spec.source.framework ? ` framework=${js(spec.source.framework)},` : ""}${spec.source.dockerfilePath ? ` dockerfile_path=${js(spec.source.dockerfilePath)},` : ""}${spec.source.rootDir ? ` root_dir=${js(spec.source.rootDir)},` : ""})`;
    const fields = [
      `name=${js(spec.name)}`,
      `source=${source}`,
      spec.private !== undefined
        ? `private=${spec.private ? "True" : "False"}`
        : null,
      spec.build != null ? `build=${js(spec.build)}` : null,
      spec.preDeploy != null ? `pre_deploy=${js(spec.preDeploy)}` : null,
      spec.start != null ? `start=${js(spec.start)}` : null,
      spec.outputDir != null ? `output_dir=${js(spec.outputDir)}` : null,
      `port=${spec.port}`,
      spec.healthcheck != null ? `healthcheck=${js(spec.healthcheck)}` : null,
      spec.replicas !== 1 ? `replicas=${spec.replicas}` : null,
      spec.cpuLimit != null ? `cpu_limit=${spec.cpuLimit}` : null,
      spec.memoryLimit != null ? `memory_limit=${spec.memoryLimit}` : null,
      !spec.autoDeploy ? "auto_deploy=False" : null,
      spec.waitForCi ? "wait_for_ci=True" : null,
      spec.prPreviews ? "pr_previews=True" : null,
      spec.volume && volumeVar
        ? `volume=${volumeVar}.mount(${js(spec.volume.path)})`
        : null,
      Object.keys(spec.env).length ? `env=${pyDict(spec.env)}` : null,
      spec.domains.length ? `domains=${JSON.stringify(spec.domains)}` : null,
    ].filter((field): field is string => field !== null);
    lines.push(
      `    ${serviceVar} = service(${js(spec.key)}, ${fields.join(", ")})`,
    );
    resources.push(serviceVar);
  });
  lines.push(
    `    return project(${js(state.project.name)}, resources=[${resources.join(", ")}]${Object.keys(state.project.env).length ? `, env=${pyDict(state.project.env)}` : ""})`,
    "",
    'if __name__ == "__main__":',
    "    run(configuration)",
    "",
  );
  return lines.join("\n");
}

const goValue = (value: VariableValue): string =>
  typeof value === "string" ? js(value) : "iac.Preserve()";
const goMap = (env: Record<string, VariableValue>): string =>
  `map[string]any{${Object.entries(env)
    .map(([key, value]) => `${js(key)}: ${goValue(value)}`)
    .join(", ")}}`;

function renderGoConfig(state: DesiredState): string {
  const lines = [
    "package main",
    "",
    'import iac "github.com/unbroker-app/iac/go"',
    "",
    "func main() {",
    "  configuration := iac.DefineUnbroker(func(ctx iac.Context) iac.ProjectDefinition {",
  ];
  const resources: string[] = [];
  state.project.services.forEach((spec, index) => {
    const serviceVar = `service${index + 1}`;
    let volumeVar: string | undefined;
    if (spec.volume) {
      volumeVar = `volume${index + 1}`;
      const key = `${spec.key.slice(0, 43).replace(/-+$/, "")}-volume`;
      lines.push(
        `    ${volumeVar} := iac.Volume(${js(key)}, iac.VolumeConfig{SizeGB: ${spec.volume.sizeGb}})`,
      );
      resources.push(volumeVar);
    }
    const source =
      spec.source.type === "image"
        ? `iac.Image(${js(spec.source.ref)}, iac.ImageConfig{Public: ${spec.source.public}})`
        : `iac.Repository(${js(spec.source.url)}, iac.RepositoryConfig{Branch: ${js(spec.source.branch)}, Framework: ${js(spec.source.framework ?? "")}, DockerfilePath: ${js(spec.source.dockerfilePath ?? "")}, RootDir: ${js(spec.source.rootDir ?? "")}})`;
    const fields = [
      `Name: ${js(spec.name)}`,
      `Source: ${source}`,
      spec.private !== undefined ? `Private: iac.Bool(${spec.private})` : null,
      spec.build != null ? `Build: ${js(spec.build)}` : null,
      spec.preDeploy != null ? `PreDeploy: ${js(spec.preDeploy)}` : null,
      spec.start != null ? `Start: ${js(spec.start)}` : null,
      spec.outputDir != null ? `OutputDir: ${js(spec.outputDir)}` : null,
      `Port: ${spec.port}`,
      spec.healthcheck != null ? `Healthcheck: ${js(spec.healthcheck)}` : null,
      spec.replicas !== 1 ? `Replicas: ${spec.replicas}` : null,
      spec.cpuLimit != null ? `CPULimit: ${spec.cpuLimit}` : null,
      spec.memoryLimit != null ? `MemoryLimit: ${spec.memoryLimit}` : null,
      !spec.autoDeploy ? "AutoDeploy: iac.Bool(false)" : null,
      spec.waitForCi ? "WaitForCI: true" : null,
      spec.prPreviews ? "PRPreviews: true" : null,
      spec.volume && volumeVar
        ? `Volume: ${volumeVar}.Mount(${js(spec.volume.path)})`
        : null,
      Object.keys(spec.env).length ? `Env: ${goMap(spec.env)}` : null,
      spec.domains.length
        ? `Domains: []string{${spec.domains.map(js).join(", ")}}`
        : null,
    ].filter((field): field is string => field !== null);
    lines.push(
      `    ${serviceVar} := iac.Service(${js(spec.key)}, iac.ServiceConfig{${fields.join(", ")}})`,
    );
    resources.push(serviceVar);
  });
  lines.push(
    `    return iac.Project(${js(state.project.name)}, iac.ProjectConfig{Resources: []iac.Resource{${resources.join(", ")}}${Object.keys(state.project.env).length ? `, Env: ${goMap(state.project.env)}` : ""}})`,
    "  })",
    "  iac.Run(configuration)",
    "}",
    "",
  );
  return lines.join("\n");
}

export function renderConfig(
  state: DesiredState,
  language: IacLanguage = "typescript",
): string {
  if (language === "python") return renderPythonConfig(state);
  if (language === "go") return renderGoConfig(state);
  return renderTypeScriptConfig(state);
}

const typescriptStarter = `import { defineUnbroker, project, repository, service } from "@unbroker/iac";

export default defineUnbroker(() => {
  const web = service("web", {
    source: repository("https://github.com/owner/repository", {
      branch: "main",
      framework: "node",
    }),
    port: 3000,
  });

  return project("my-project", { resources: [web] });
});
`;

const pythonStarter = `from unbroker_iac import define_unbroker, project, repository, run, service

@define_unbroker
def configuration(ctx):
    web = service(
        "web",
        source=repository(
            "https://github.com/owner/repository",
            branch="main",
            framework="node",
        ),
        port=3000,
    )
    return project("my-project", resources=[web])

if __name__ == "__main__":
    run(configuration)
`;

const goStarter = `package main

import iac "github.com/unbroker-app/iac/go"

func main() {
  configuration := iac.DefineUnbroker(func(ctx iac.Context) iac.ProjectDefinition {
    web := iac.Service("web", iac.ServiceConfig{
      Source: iac.Repository("https://github.com/owner/repository", iac.RepositoryConfig{
        Branch: "main",
        Framework: "node",
      }),
      Port: 3000,
    })
    return iac.Project("my-project", iac.ProjectConfig{Resources: []iac.Resource{web}})
  })
  iac.Run(configuration)
}
`;

export function starterConfig(language: IacLanguage): string {
  if (language === "python") return pythonStarter;
  if (language === "go") return goStarter;
  return typescriptStarter;
}

export const goModule = `module unbroker-iac-config

go 1.22

require github.com/unbroker-app/iac v0.3.0
`;
