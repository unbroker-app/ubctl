import { Command, Option } from "commander";
import type {
  ServiceResponse,
  DeploymentResponse,
  DeploymentsResponse,
  DeploymentStatus,
} from "../../api/types";
import { authed, withJson, sleep } from "../helpers";
import { CliError } from "../../util/errors";
import { print, printJson, printTable } from "../../util/output";
import { age, duration } from "../../util/format";
import { positiveNumber } from "../../util/validate";
import type { ApiClient } from "../../api/client";
import {
  Cancelled,
  followDeploy,
  interactiveNow,
  serviceId as resolveService,
} from "../../interactive";
import { color, statusText } from "../../util/color";

const FAILED: DeploymentStatus[] = ["failed", "cancelled"];
const TERMINAL: DeploymentStatus[] = [
  "live",
  "failed",
  "superseded",
  "cancelled",
];

/** `ubctl apps deploy [serviceId] [--wait | --detach]` */
export function deployCommand(): Command {
  return withJson(
    new Command("deploy")
      .description(
        "Trigger a deployment for a service (follows it live in a terminal)",
      )
      .argument("[serviceId]", "service id (picked interactively if omitted)")
      .option("--wait", "poll until the deployment finishes")
      .option("--detach", "queue it and return without following")
      .addOption(
        new Option("--timeout <seconds>", "max seconds to wait with --wait")
          .argParser((value) => positiveNumber(value, "timeout"))
          .default(300),
      )
      .action(
        async (
          serviceArg: string | undefined,
          opts: {
            wait?: boolean;
            detach?: boolean;
            timeout: number;
            json?: boolean;
          },
          cmd: Command,
        ) => {
          const { ctx, client } = authed(cmd);
          const serviceId = await resolveService(ctx, client, serviceArg);
          await runDeploy(client, serviceId, {
            wait: opts.wait,
            detach: opts.detach,
            // Picking the service means a person is driving: follow live.
            live: !serviceArg,
            timeoutMs: opts.timeout * 1000,
            json: ctx.json,
          });
        },
      ),
  );
}

/**
 * Queue a deployment and, with `wait`, follow it to a terminal state. Shared
 * by `apps deploy`, `apps scale --deploy` and the interactive flows; throws
 * when the wait doesn't end in success so the process exits non-zero.
 *
 * At an interactive terminal the wait is shown live (build log streaming
 * above a progress footer). That happens for `--wait`, or with `live` when a
 * person drove the flow (picked the service, the create wizard, the scale
 * editor). A plain `apps deploy <id>` still queues and returns, as scripts
 * expect.
 */
export async function runDeploy(
  client: ApiClient,
  serviceId: string,
  opts: {
    wait?: boolean;
    detach?: boolean;
    /** Follow live even without --wait (interactive flows). */
    live?: boolean;
    timeoutMs: number;
    json: boolean;
  },
): Promise<void> {
  const { deployment } = await client.post<DeploymentResponse>(
    `/apps/services/${serviceId}/deployments`,
    {},
  );

  const follow = !opts.detach && (opts.wait || opts.live);
  if (follow && (await interactiveNow(opts))) {
    const label = await client
      .get<ServiceResponse>(`/apps/services/${serviceId}`)
      .then((r) => r.service.name)
      .catch(() => serviceId);
    const result = await followDeploy(
      client,
      deployment.id,
      label,
      opts.wait ? opts.timeoutMs : 30 * 60_000,
    );
    const check = `ubctl apps deployment ${deployment.id}`;
    if (result.kind === "error")
      throw new CliError(
        `following ${deployment.id} failed: ${result.message}`,
      );
    if (result.kind === "detached") {
      const last = result.deployment?.status ?? deployment.status;
      if (result.reason === "timeout")
        throw new CliError(
          `timed out waiting for deployment ${deployment.id} (last: ${last})`,
        );
      print(
        `${color.muted("…")} Stopped following — ${deployment.id} keeps running (${last}). Check it with: ${check}`,
      );
      // Leaving a --wait early must not read as success to whatever runs next.
      if (result.reason === "interrupt") throw new Cancelled();
      if (opts.wait)
        throw new CliError(
          `detached before deployment ${deployment.id} finished`,
        );
      return;
    }
    const final = result.deployment;
    const took = duration(final.createdAt, final.finishedAt);
    if (FAILED.includes(final.status)) {
      print(
        `${color.error("✘")} Deployment ${final.id} ${statusText(final.status)} after ${took}`,
      );
      throw new CliError(`deployment ${final.status}`);
    }
    print(
      `${color.success("✔")} Deployment ${final.id} ${statusText(final.status)} in ${took}`,
    );
    return;
  }

  if (!opts.wait) {
    if (opts.json) return printJson(deployment);
    print(`Queued deployment ${deployment.id} (${deployment.status})`);
    print(
      `Follow it with: ubctl apps deployment ${deployment.id} --log (or deploy with --wait)`,
    );
    return;
  }

  const final = await poll(client, deployment.id, opts.timeoutMs, !opts.json);
  if (opts.json) return printJson(final);
  print(
    `Deployment ${final.id} → ${final.status} (${duration(
      final.createdAt,
      final.finishedAt,
    )})`,
  );
  if (FAILED.includes(final.status)) {
    print("--- build log (tail) ---");
    print(tail(final.buildLog, 20));
    throw new CliError(`deployment ${final.status}`);
  }
}

/** `ubctl apps deployments <serviceId>` */
export function deploymentsCommand(): Command {
  return withJson(
    new Command("deployments")
      .description("List a service's deployments")
      .argument("[serviceId]", "service id (picked interactively if omitted)")
      .action(
        async (
          serviceArg: string | undefined,
          _opts: unknown,
          cmd: Command,
        ) => {
          const { ctx, client } = authed(cmd);
          const serviceId = await resolveService(ctx, client, serviceArg);
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
        },
      ),
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
