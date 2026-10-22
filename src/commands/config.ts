import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { Command } from "commander";
import { authed, withJson } from "./helpers";
import { print, printJson } from "../util/output";
import { CliError } from "../util/errors";
import {
  evaluateConfig,
  findConfigPath,
  newConfigPath,
  readPlanId,
  renderConfig,
  starterConfig,
  writeConfig,
  type DesiredState,
  type EvaluationContext,
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
  changes?: Record<string, unknown>;
}

interface PlanResponse {
  planId: string;
  environmentId: string;
  expiresAt: number;
  destructive: boolean;
  summary: { add: number; change: number; destroy: number; replace: number };
  changes: PlanChange[];
}

interface ApplyResponse extends PlanResponse {
  applied: true;
  etag: string;
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
      `  ${symbols[change.action]} ${change.address}${change.destructive ? " (destructive)" : ""}`,
    );
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
    .description("Create .unbroker/unbroker.ts")
    .option("--file <path>", "configuration file path")
    .option("--force", "replace an existing file")
    .action((opts: { file?: string; force?: boolean }) => {
      const file = opts.file ? resolve(opts.file) : newConfigPath();
      writeConfig(file, starterConfig, opts.force);
      print(`Created ${file}`);
      print(
        "Install @unbroker/iac, edit the source and run `ubctl config plan <projectId>`.",
      );
    });

  withJson(
    config
      .command("pull <projectId>")
      .description("Write the current environment as TypeScript configuration")
      .option("--environment <id>", "environment id")
      .option("--file <path>", "destination file path")
      .option("--force", "replace an existing file")
      .action(
        async (
          projectId: string,
          opts: { environment?: string; file?: string; force?: boolean },
          cmd: Command,
        ) => {
          const { ctx, client } = authed(cmd);
          const state = await client.get<StateResponse>(
            `/apps/projects/${projectId}/iac/state${query(opts.environment)}`,
          );
          const file = opts.file ? resolve(opts.file) : newConfigPath();
          writeConfig(file, renderConfig(state.state), opts.force);
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
      .option("--out <path>", "write the saved plan metadata as JSON")
      .option("--force", "replace an existing plan artifact")
      .option("--detailed-exit-code", "exit 2 when the plan contains changes")
      .action(
        async (
          projectId: string,
          opts: {
            environment?: string;
            file?: string;
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
            { environmentId: state.environmentId, desiredState },
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
        },
      ),
  );

  return config;
}
