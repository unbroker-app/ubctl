import { Command, Option } from "commander";
import type {
  DeploymentResponse,
  DeploymentsResponse,
  DeploymentStatus,
} from "../../api/types";
import { authed, withJson, sleep } from "../helpers";
import { CliError } from "../../util/errors";
import { print, printJson, printTable } from "../../util/output";
import { age, duration } from "../../util/format";
import { positiveNumber } from "../../util/validate";

const TERMINAL: DeploymentStatus[] = ["live", "failed", "superseded"];

/** `ubctl apps deploy <serviceId> [--wait]` */
export function deployCommand(): Command {
  return withJson(
    new Command("deploy")
      .description("Trigger a deployment for a service")
      .argument("<serviceId>", "service id")
      .option("--wait", "poll until the deployment finishes")
      .addOption(
        new Option("--timeout <seconds>", "max seconds to wait with --wait")
          .argParser((value) => positiveNumber(value, "timeout"))
          .default(300),
      )
      .action(
        async (
          serviceId: string,
          opts: { wait?: boolean; timeout: number; json?: boolean },
          cmd: Command,
        ) => {
          const { ctx, client } = authed(cmd);
          const { deployment } = await client.post<DeploymentResponse>(
            `/apps/services/${serviceId}/deployments`,
            {},
          );

          if (!opts.wait) {
            if (ctx.json) return printJson(deployment);
            print(`Queued deployment ${deployment.id} (${deployment.status})`);
            print(
              `Follow it with: ubctl apps deployment ${deployment.id} --log`,
            );
            return;
          }

          const final = await poll(
            client,
            deployment.id,
            opts.timeout * 1000,
            !ctx.json,
          );
          if (ctx.json) return printJson(final);
          print(
            `Deployment ${final.id} → ${final.status} (${duration(
              final.createdAt,
              final.finishedAt,
            )})`,
          );
          if (final.status === "failed") {
            print("--- build log (tail) ---");
            print(tail(final.buildLog, 20));
            throw new CliError("deployment failed");
          }
        },
      ),
  );
}

/** `ubctl apps deployments <serviceId>` */
export function deploymentsCommand(): Command {
  return withJson(
    new Command("deployments")
      .description("List a service's deployments")
      .argument("<serviceId>", "service id")
      .action(async (serviceId: string, _opts: unknown, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const { deployments } = await client.get<DeploymentsResponse>(
          `/apps/services/${serviceId}/deployments`,
        );
        if (ctx.json) return printJson(deployments);
        printTable(
          deployments.map((d) => ({
            ...d,
            commit: d.commitSha?.slice(0, 7) ?? "-",
            created: age(d.createdAt),
            took: duration(d.createdAt, d.finishedAt),
          })),
          [
            { key: "id", header: "id" },
            { key: "status", header: "status" },
            { key: "trigger", header: "trigger" },
            { key: "commit", header: "commit" },
            { key: "created", header: "created" },
            { key: "took", header: "took" },
          ],
        );
      }),
  );
}

/** `ubctl apps deployment <id> [--log]` */
export function deploymentCommand(): Command {
  return withJson(
    new Command("deployment")
      .description("Show one deployment (and its build log)")
      .argument("<id>", "deployment id")
      .option("--log", "print the full build log")
      .action(
        async (
          id: string,
          opts: { log?: boolean; json?: boolean },
          cmd: Command,
        ) => {
          const { ctx, client } = authed(cmd);
          const { deployment } = await client.get<DeploymentResponse>(
            `/apps/deployments/${id}`,
          );
          if (ctx.json) return printJson(deployment);
          print(`id:      ${deployment.id}`);
          print(`service: ${deployment.serviceId}`);
          print(`status:  ${deployment.status}`);
          print(`trigger: ${deployment.trigger}`);
          print(`commit:  ${deployment.commitSha ?? "-"}`);
          print(`created: ${age(deployment.createdAt)}`);
          print(
            `took:    ${duration(deployment.createdAt, deployment.finishedAt)}`,
          );
          if (opts.log) {
            print("--- build log ---");
            print(deployment.buildLog || "(empty)");
          }
        },
      ),
  );
}

/** `ubctl apps rollback <serviceId> <deploymentId>` */
export function rollbackCommand(): Command {
  return withJson(
    new Command("rollback")
      .description("Re-point live to a previous successful deployment")
      .argument("<serviceId>", "service id")
      .argument("<deploymentId>", "deployment to roll back to")
      .action(
        async (
          serviceId: string,
          deploymentId: string,
          _opts: unknown,
          cmd: Command,
        ) => {
          const { ctx, client } = authed(cmd);
          const { deployment } = await client.post<DeploymentResponse>(
            `/apps/services/${serviceId}/rollback`,
            { deploymentId },
          );
          if (ctx.json) return printJson(deployment);
          print(
            `Rolled back — live is now ${deployment.id} (${deployment.status})`,
          );
        },
      ),
  );
}

/** `ubctl apps cancel <deploymentId>` */
export function cancelDeploymentCommand(): Command {
  return new Command("cancel")
    .description("Cancel a queued or running deployment")
    .argument("<deploymentId>", "deployment to cancel")
    .action(async (id: string, _opts: unknown, cmd: Command) => {
      const { ctx, client } = authed(cmd);
      const { deployment } = await client.post<DeploymentResponse>(
        `/apps/deployments/${id}/cancel`,
      );
      if (ctx.json) return printJson(deployment);
      print(`Cancelled deployment ${deployment.id} (${deployment.status})`);
    })
    .option("--json", "output raw JSON");
}

interface PollClient {
  get<T>(path: string): Promise<T>;
}

/** Poll a deployment until it reaches a terminal status or the deadline. */
async function poll(
  client: PollClient,
  id: string,
  timeoutMs: number,
  showProgress: boolean,
): Promise<DeploymentResponse["deployment"]> {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  for (;;) {
    const { deployment } = await client.get<DeploymentResponse>(
      `/apps/deployments/${id}`,
    );
    if (showProgress && deployment.status !== last) {
      print(`  ${deployment.status}…`);
      last = deployment.status;
    }
    if (TERMINAL.includes(deployment.status)) return deployment;
    if (Date.now() > deadline) {
      throw new CliError(
        `timed out waiting for deployment ${id} (last: ${deployment.status})`,
      );
    }
    await sleep(2000);
  }
}

function tail(text: string, lines: number): string {
  return text.split("\n").slice(-lines).join("\n");
}
