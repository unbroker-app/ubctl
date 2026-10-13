import type { Context } from "./context";
import type { ApiClient } from "./api/client";
import type { ProjectsResponse, ServicesResponse, Service } from "./api/types";
import type { DatabasesResponse } from "./api/cloud-types";
import type { Choice, InputOptions, SelectOptions } from "./tui/inline/prompts";
import { CliError } from "./util/errors";
import { print } from "./util/output";
import { color } from "./util/color";
import { isForeground, tuiAvailable } from "./runtime";

/**
 * Interactive layer for regular commands: pickers instead of ids, wizards
 * instead of a wall of flags, and a live deploy view. It only engages when a
 * human is at the terminal of the standalone binary: stdin and stdout are
 * TTYs, `--json` is off, `CI` is unset, the build includes the TUI, and the
 * process is the terminal's foreground job. Everywhere else commands behave
 * exactly as before, so scripts never block on a prompt.
 */
export function canPrompt(ctx: Pick<Context, "json">): boolean {
  return (
    !ctx.json &&
    Boolean(process.stdin.isTTY && process.stdout.isTTY) &&
    !process.env.CI &&
    tuiAvailable()
  );
}

/** {@link canPrompt} plus the foreground-job check; use before prompting. */
export async function interactiveNow(
  ctx: Pick<Context, "json">,
): Promise<boolean> {
  return canPrompt(ctx) && (await isForeground());
}

// The prompt modules render with OpenTUI, so they're loaded on demand; the
// Node build replaces them with stubs (scripts/build.ts) that canPrompt keeps
// from ever being called.
const prompts = () => import("./tui/inline/prompts");
const deploys = () => import("./tui/inline/deploy");
const scales = () => import("./tui/inline/scale");

/** Thrown when the user backs out of a prompt; exits quietly with code 130. */
export class Cancelled extends CliError {
  constructor() {
    super("cancelled");
    this.name = "Cancelled";
  }
}

function answered(label: string, value: string): void {
  print(`${color.primary("✔")} ${label} ${color.muted("·")} ${value}`);
}

export async function pick<T>(options: SelectOptions<T>): Promise<T> {
  const { select } = await prompts();
  const value = await select(options);
  if (value === undefined) throw new Cancelled();
  const choice = options.choices.find((c) => c.value === value);
  answered(options.message, choice?.title ?? String(value));
  return value;
}

export async function ask(options: InputOptions): Promise<string> {
  const { input } = await prompts();
  const value = await input(options);
  if (value === undefined) throw new Cancelled();
  answered(options.message, options.secret ? "••••••" : value || "(empty)");
  return value;
}

export async function agree(
  message: string,
  initial = false,
): Promise<boolean> {
  const { confirm } = await prompts();
  const value = await confirm(message, initial);
  if (value === undefined) throw new Cancelled();
  answered(message, value ? "yes" : "no");
  return value;
}

export type { Choice };

/**
 * Resolve a service id: use the argument when given, otherwise let the user
 * pick one interactively, otherwise fail like a missing argument would.
 */
export async function serviceId(
  ctx: Pick<Context, "json">,
  client: ApiClient,
  id: string | undefined,
  filter: (service: Service) => boolean = () => true,
): Promise<string> {
  if (id) return id;
  if (!(await interactiveNow(ctx)))
    throw new CliError("missing required argument 'id'");
  const [{ services }, { projects }] = await Promise.all([
    client.get<ServicesResponse>("/apps/services"),
    client.get<ProjectsResponse>("/apps/projects"),
  ]);
  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  const choices = services.filter(filter).map((s) => ({
    title: s.name,
    value: s.id,
    hint: `${projectName.get(s.projectId) ?? "-"} · ${s.status}`,
  }));
  if (choices.length === 0) throw new CliError("no services to choose from");
  return pick({ message: "Service", choices });
}

export async function projectId(
  ctx: Pick<Context, "json">,
  client: ApiClient,
  id: string | undefined,
): Promise<string> {
  if (id) return id;
  if (!(await interactiveNow(ctx)))
    throw new CliError("missing required argument 'projectId'");
  const { projects } = await client.get<ProjectsResponse>("/apps/projects");
  if (projects.length === 0)
    throw new CliError(
      "no projects yet — create one with `ubctl apps projects create --name <name>`",
    );
  return pick({
    message: "Project",
    choices: projects.map((p) => ({ title: p.name, value: p.id, hint: p.id })),
  });
}

export async function databaseId(
  ctx: Pick<Context, "json">,
  client: ApiClient,
  id: string | undefined,
): Promise<string> {
  if (id) return id;
  if (!(await interactiveNow(ctx)))
    throw new CliError("missing required argument 'id'");
  const { databases } = await client.get<DatabasesResponse>("/databases");
  if (databases.length === 0) throw new CliError("no managed databases yet");
  return pick({
    message: "Database",
    choices: databases.map((d) => ({
      title: d.name,
      value: d.id,
      hint: `${d.engine} ${d.version} · ${d.status}`,
    })),
  });
}

/** Follow a deployment live; returns when it finishes or the user detaches. */
export async function followDeploy(
  client: ApiClient,
  deploymentId: string,
  label: string,
  timeoutMs: number,
): Promise<import("./tui/inline/deploy").FollowResult> {
  const { followDeployment } = await deploys();
  const result = await followDeployment(client, deploymentId, label, timeoutMs);
  return (
    result ?? { kind: "detached", reason: "interrupt", deployment: undefined }
  );
}

/** Open the scale editor inline; resolves with what was saved, if anything. */
export async function editScaleInline(
  client: ApiClient,
  ctx: Context,
  orgId: string,
  service: Service,
): Promise<import("./tui/inline/scale").ScaleEditResult | undefined> {
  const { editScale } = await scales();
  return editScale(client, ctx, orgId, service);
}
