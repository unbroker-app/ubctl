import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { Command } from "commander";
import { authed, withJson } from "./helpers";
import { print, printJson } from "../util/output";
import { CliError } from "../util/errors";
import {
  evaluateConfig,
  findConfigPath,
  configLanguage,
  goModule,
  languageForFile,
  newConfigPath,
  readPlanId,
  renderConfig,
  starterConfig,
  writeConfig,
  type DesiredState,
  type EvaluationContext,
  type IacLanguage,
} from "../config/iac";

interface StateResponse {
  environmentId: string;
  environmentName: string;
  etag: string;
  state: DesiredState;
}

interface PlanChange {
  action: "add" | "change" | "destroy" | "replace";
  address: string;
  destructive: boolean;
  deploy?: boolean;
  effect?: "redeploy" | "rebuild";
  changes?: Record<string, unknown>;
}

interface PlanResponse {
  planId: string;
  environmentId: string;
  expiresAt: number;
  destructive: boolean;
  partial?: string | null;
  summary: { add: number; change: number; destroy: number; replace: number };
  changes: PlanChange[];
  releases?: {
    serviceKey: string;
    effect: "redeploy" | "rebuild";
    liveDeploymentId: string | null;
    commitSha: string | null;
    imageRef: string | null;
    pinned: boolean;
  }[];
}

interface ApplyResponse extends PlanResponse {
  applied: true;
  etag: string;
  deployments?: { serviceId: string; slug: string }[];
  deploymentSchedulingFailed?: boolean;
}

const query = (environment?: string): string =>
  environment ? `?environmentId=${encodeURIComponent(environment)}` : "";

const contextFor = (
  command: EvaluationContext["command"],
  projectId: string,
  state: StateResponse,
): EvaluationContext => ({
  command,
  projectId,
  projectName: state.state.project.name,
  environmentId: state.environmentId,
  environment: state.environmentName,
  environmentName: state.environmentName,
  isEnvironment: (name) => name === state.environmentName,
});

function printPlan(plan: PlanResponse): void {
  const symbols = { add: "+", change: "~", destroy: "-", replace: "+/-" };
  print(
    `Plan: ${plan.summary.add} to add, ${plan.summary.change} to change, ${plan.summary.destroy} to destroy, ${plan.summary.replace} to replace`,
  );
  for (const change of plan.changes)
    print(
      `  ${symbols[change.action]} ${change.address}${change.destructive ? " (destructive)" : ""}${change.effect ? ` (${change.effect})` : change.deploy ? " (deploy)" : ""}`,
    );
  for (const release of plan.releases ?? []) {
    const revision =
      release.commitSha ?? release.imageRef ?? "configured source";
    print(
      `  → ${release.serviceKey}: ${release.effect} ${revision}${release.pinned ? " (pinned)" : " (resolved at deploy)"}`,
    );
  }
}

async function confirmApply(): Promise<void> {
  if (!process.stdin.isTTY || !process.stderr.isTTY)
    throw new CliError("non-interactive apply requires --yes");
  const readline = createInterface({
    input: process.stdin,
    output: process.stderr,
  });
  const answer = await readline.question("Apply this saved plan? [y/N] ");
  readline.close();
  if (!/^(?:y|yes)$/i.test(answer.trim()))
    throw new CliError("apply cancelled");
}

export function configCommand(): Command {
  const config = new Command("config").description(
    "Manage project infrastructure as code",
  );

  config
    .command("init")
    .description("Create an IaC authoring file")
    .option("--lang <language>", "typescript, python or go", "typescript")
    .option("--file <path>", "configuration file path")
    .option("--force", "replace an existing file")
    .action((opts: { lang: string; file?: string; force?: boolean }) => {
      const language = configLanguage(opts.lang);
      const file = opts.file
        ? resolve(opts.file)
        : newConfigPath(process.cwd(), language);
      if (opts.file && languageForFile(file) !== language)
        throw new CliError("--lang must match the --file extension");
      const goMod =
        language === "go" ? join(dirname(file), "go.mod") : undefined;
      writeConfig(file, starterConfig(language), opts.force);
      // A caller may intentionally put the authoring file in an existing Go
      // module. --force only replaces the config, never module metadata.
      if (goMod && !existsSync(goMod)) writeConfig(goMod, goModule);
      print(`Created ${file}`);
      print(
        "Install the matching SDK, edit the source and run `ubctl config plan <projectId>`.",
      );
    });

  withJson(
    config
      .command("pull <projectId>")
      .description("Write the current environment as TypeScript configuration")
      .option("--environment <id>", "environment id")
      .option("--lang <language>", "typescript, python or go", "typescript")
      .option("--file <path>", "destination file path")
      .option("--force", "replace an existing file")
      .action(
        async (
          projectId: string,
          opts: {
            environment?: string;
            lang: string;
            file?: string;
            force?: boolean;
          },
          cmd: Command,
        ) => {
          const { ctx, client } = authed(cmd);
          const state = await client.get<StateResponse>(
            `/apps/projects/${projectId}/iac/state${query(opts.environment)}`,
          );
          const language: IacLanguage = opts.file
            ? languageForFile(opts.file)
            : configLanguage(opts.lang);
          if (
            opts.file &&
            opts.lang !== "typescript" &&
            configLanguage(opts.lang) !== language
          )
            throw new CliError("--lang must match the --file extension");
          const file = opts.file
            ? resolve(opts.file)
            : newConfigPath(process.cwd(), language);
          writeConfig(file, renderConfig(state.state, language), opts.force);
          if (language === "go") {
            const goMod = join(dirname(file), "go.mod");
            if (!existsSync(goMod)) writeConfig(goMod, goModule);
          }
          const result = {
            file,
            projectId,
            environmentId: state.environmentId,
            etag: state.etag,
          };
          if (ctx.json) return printJson(result);
          print(
            `Wrote ${file} from ${state.environmentName} (${state.environmentId})`,
          );
        },
      ),
  );

  withJson(
    config
      .command("plan <projectId>")
      .description("Preview and save changes without applying them")
      .option("--environment <id>", "environment id")
      .option("--file <path>", "configuration file path")
      .option("--partial <name>", "named multi-repo ownership scope")
      .option("--out <path>", "write the saved plan metadata as JSON")
      .option("--force", "replace an existing plan artifact")
      .option("--detailed-exit-code", "exit 2 when the plan contains changes")
      .action(
        async (
          projectId: string,
          opts: {
            environment?: string;
            file?: string;
            partial?: string;
            out?: string;
            force?: boolean;
            detailedExitCode?: boolean;
          },
          cmd: Command,
        ) => {
          const { ctx, client } = authed(cmd);
          const state = await client.get<StateResponse>(
            `/apps/projects/${projectId}/iac/state${query(opts.environment)}`,
          );
          const file = findConfigPath(opts.file);
          const desiredState = await evaluateConfig(
            file,
            contextFor("plan", projectId, state),
          );
          const plan = await client.post<PlanResponse>(
            `/apps/projects/${projectId}/iac/plan`,
            {
              environmentId: state.environmentId,
              partial: opts.partial,
              desiredState,
            },
          );
          if (opts.out) {
            const out = resolve(opts.out);
            writeConfig(out, JSON.stringify(plan, null, 2) + "\n", opts.force);
          }
          if (ctx.json) printJson(plan);
          else {
            print(`Using ${file}`);
            printPlan(plan);
            print(`Saved plan: ${plan.planId}`);
          }
          if (
            opts.detailedExitCode &&
            Object.values(plan.summary).some((count) => count > 0)
          )
            process.exitCode = 2;
        },
      ),
  );

  withJson(
    config
      .command("apply <projectId>")
      .description("Apply an immutable saved plan")
      .requiredOption("--plan <id-or-file>", "plan id or plan artifact path")
      .option("--yes", "apply without an interactive confirmation")
      .option(
        "--confirm-destructive",
        "allow service, domain or variable destruction",
      )
      .action(
        async (
          projectId: string,
          opts: {
            plan: string;
            yes?: boolean;
            confirmDestructive?: boolean;
          },
          cmd: Command,
        ) => {
          const { ctx, client } = authed(cmd);
          const planId = readPlanId(opts.plan);
          if (!opts.yes) {
            if (ctx.json) throw new CliError("JSON apply requires --yes");
            print(`Saved plan: ${planId}`);
            await confirmApply();
          }
          const result = await client.post<ApplyResponse>(
            `/apps/projects/${projectId}/iac/apply`,
            {
              planId,
              confirmDestructive: Boolean(opts.confirmDestructive),
            },
          );
          if (ctx.json) return printJson(result);
          printPlan(result);
          print(`Applied ${result.planId}; environment state ${result.etag}`);
          if (result.deployments?.length)
            print(
              `Queued deployments: ${result.deployments.map((deployment) => deployment.slug).join(", ")}`,
            );
          if (result.deploymentSchedulingFailed)
            print(
              "Infrastructure applied, but affected deployments could not be queued; retry them with `ubctl apps deploy`.",
            );
        },
      ),
  );

  return config;
}
