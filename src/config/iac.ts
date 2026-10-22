import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { createJiti } from "jiti";
import { CliError } from "../util/errors";

export interface PreserveValue {
  $unbroker: "preserve";
}

export type VariableValue = string | PreserveValue;

export interface DesiredService {
  key: string;
  name: string;
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

interface Configuration {
  evaluate(context: EvaluationContext): DesiredState;
}

const DEFAULT_RELATIVE_PATH = join(".unbroker", "unbroker.ts");
const CONFIG_NAMES = ["unbroker.ts", "unbroker.js", "unbroker.mjs"];

export function newConfigPath(cwd = process.cwd()): string {
  return join(cwd, DEFAULT_RELATIVE_PATH);
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
    for (const name of CONFIG_NAMES) {
      const candidate = join(directory, ".unbroker", name);
      if (existsSync(candidate)) return candidate;
    }
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  throw new CliError(
    "no .unbroker/unbroker.ts found; run `ubctl config init` or pass --file",
  );
}

export async function evaluateConfig(
  file: string,
  context: EvaluationContext,
): Promise<DesiredState> {
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

export function renderConfig(state: DesiredState): string {
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

export const starterConfig = `import { defineUnbroker, project, repository, service } from "@unbroker/iac";

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
