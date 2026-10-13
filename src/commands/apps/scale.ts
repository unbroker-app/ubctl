import { Command, Option } from "commander";
import type { OrganizationResponse, ServiceResponse } from "../../api/types";
import { authed, withJson } from "../helpers";
import { CliError } from "../../util/errors";
import { print, printJson, printTable } from "../../util/output";
import { integerRange, positiveNumber } from "../../util/validate";
import {
  SCALE_LIMITS,
  clockTime,
  describeLimits,
  describeScale,
  nullableInteger,
  scaleDiff,
  scalePatch,
  validateScale,
  weekdays,
  type ScaleOptions,
} from "../../util/scale";
import { runDeploy } from "./deployments";
import {
  editScaleInline,
  interactiveNow,
  serviceId as resolveService,
} from "../../interactive";

interface ScaleCommandOptions extends ScaleOptions {
  deploy?: boolean;
  wait?: boolean;
  timeout: number;
  dryRun?: boolean;
}

const { replicas, cpu, memory, targetPercent } = SCALE_LIMITS;

/**
 * `ubctl apps services scale <id>` (also `ubctl apps scale <id>`): change
 * replicas, per-replica CPU/memory, autoscaling and scheduled scale windows.
 * The API stores the change and applies it on the next deploy; `--deploy`
 * rolls it out immediately.
 */
export function scaleCommand(): Command {
  return withJson(
    new Command("scale")
      .description(
        "Change replicas, CPU/memory limits and autoscaling (applies on next deploy)",
      )
      .argument("[id]", "service id (picked interactively if omitted)")
      .addOption(
        new Option(
          "--replicas <n>",
          `fixed replica count (${replicas.min}-${replicas.max}, capped by your tier)`,
        ).argParser((v) =>
          integerRange(v, "replicas", replicas.min, replicas.max),
        ),
      )
      .addOption(
        new Option(
          "--cpu <millicores>",
          `CPU limit per replica (${cpu.min}-${cpu.max}m) or "default"`,
        ).argParser(nullableInteger("cpu", cpu.min, cpu.max)),
      )
      .addOption(
        new Option(
          "--memory <MiB>",
          `memory limit per replica (${memory.min}-${memory.max}Mi) or "default"`,
        ).argParser(nullableInteger("memory", memory.min, memory.max)),
      )
      .option("--autoscale", "scale between --min and --max on load")
      .option("--no-autoscale", "pin to --replicas")
      .addOption(
        new Option(
          "--min <n>",
          'autoscale floor, or "default" (= replicas)',
        ).argParser(nullableInteger("min", replicas.min, replicas.max)),
      )
      .addOption(
        new Option(
          "--max <n>",
          'autoscale ceiling, or "default" (= replicas)',
        ).argParser(nullableInteger("max", replicas.min, replicas.max)),
      )
      .addOption(
        new Option(
          "--target-cpu <percent>",
          `CPU utilization target (${targetPercent.min}-${targetPercent.max}, default 70)`,
        ).argParser(
          nullableInteger("target cpu", targetPercent.min, targetPercent.max),
        ),
      )
      .addOption(
        new Option(
          "--target-memory <percent>",
          `memory utilization target (${targetPercent.min}-${targetPercent.max}) or "off"`,
        ).argParser(
          nullableInteger(
            "target memory",
            targetPercent.min,
            targetPercent.max,
          ),
        ),
      )
      .option("--scale-on-cpu", "use CPU as an autoscale trigger (default)")
      .option("--no-scale-on-cpu", "scale on memory only")
      .option(
        "--window",
        "enable a scheduled pre-warm window (dedicated cells)",
      )
      .option("--no-window", "disable the scheduled window")
      .addOption(
        new Option(
          "--window-min <n>",
          "replica floor inside the window",
        ).argParser(nullableInteger("window min", replicas.min, replicas.max)),
      )
      .addOption(
        new Option("--window-start <HH:MM>", "window start").argParser(
          clockTime,
        ),
      )
      .addOption(
        new Option("--window-end <HH:MM>", "window end").argParser(clockTime),
      )
      .addOption(
        new Option(
          "--window-days <digits>",
          "ISO weekdays, e.g. 12345 for Mon-Fri",
        ).argParser(weekdays),
      )
      .option("--window-tz <zone>", "IANA time zone, e.g. America/New_York")
      .option("--deploy", "roll out the change now with a new deployment")
      .option("--wait", "with --deploy: wait for the deployment to finish")
      .addOption(
        new Option("--timeout <seconds>", "max seconds to wait with --wait")
          .argParser((value) => positiveNumber(value, "timeout"))
          .default(300),
      )
      .option("--dry-run", "validate and print the change without saving it")
      .action(
        async (
          idArg: string | undefined,
          opts: ScaleCommandOptions,
          cmd: Command,
        ) => {
          const { ctx, client } = authed(cmd);
          const id = await resolveService(ctx, client, idArg);
          const patch = scalePatch(opts);
          if (Object.keys(patch).length === 0) {
            // Nothing to change, but --deploy still rolls out pending changes
            // (e.g. a scale saved earlier without --deploy).
            if (opts.deploy && !opts.dryRun)
              return runDeploy(client, id, {
                wait: opts.wait,
                timeoutMs: opts.timeout * 1000,
                json: ctx.json,
              });
            const { service } = await client.get<ServiceResponse>(
              `/apps/services/${id}`,
            );
            if (ctx.json) return printJson(service);
            // No flags at a terminal: edit the scale in place, like the
            // dashboard. Never with --dry-run, whose promise is "nothing saved".
            if (!opts.dryRun && (await interactiveNow(ctx))) {
              const result = await editScaleInline(
                client,
                ctx,
                ctx.org ?? "",
                service,
              );
              if (!result) return print("No changes saved.");
              print(
                `Updated scale for ${result.service.name} (${result.service.id})`,
              );
              printChanges(scaleDiff(service, result.service));
              if (result.deploy)
                return runDeploy(client, result.service.id, {
                  live: true,
                  timeoutMs: opts.timeout * 1000,
                  json: false,
                });
              if (result.service.needsRedeploy)
                print(
                  `Takes effect on the next deploy: ubctl apps deploy ${result.service.id}`,
                );
              return;
            }
            print(`scale:   ${describeScale(service)}`);
            print(`limits:  ${describeLimits(service)}`);
            print(
              opts.dryRun
                ? "Dry run — no changes requested."
                : "Pass --replicas, --cpu, --memory or --autoscale to change it.",
            );
            return;
          }

          const [{ service: before }, maxReplicas] = await Promise.all([
            client.get<ServiceResponse>(`/apps/services/${id}`),
            replicaCeiling(client, ctx.org),
          ]);
          const problem = validateScale(before, patch, maxReplicas);
          if (problem) throw new CliError(problem);

          if (opts.dryRun) {
            if (ctx.json) return printJson({ patch });
            printChanges(scaleDiff(before, { ...before, ...patch }));
            print("Dry run — nothing was saved.");
            return;
          }

          const { service: after } = await client.patch<ServiceResponse>(
            `/apps/services/${id}`,
            patch,
          );
          if (!opts.deploy && ctx.json) return printJson(after);
          if (!ctx.json) {
            print(`Updated scale for ${after.name} (${after.id})`);
            printChanges(scaleDiff(before, after));
          }
          if (opts.deploy) {
            await runDeploy(client, after.id, {
              wait: opts.wait,
              timeoutMs: opts.timeout * 1000,
              json: ctx.json,
            });
          } else if (after.needsRedeploy) {
            print(
              `Takes effect on the next deploy: ubctl apps deploy ${after.id} --wait`,
            );
          }
        },
      ),
  );
}

function printChanges(rows: ReturnType<typeof scaleDiff>): void {
  if (rows.length === 0) return print("(no visible change)");
  printTable(rows, [
    { key: "field", header: "field" },
    { key: "before", header: "before" },
    { key: "after", header: "after" },
  ]);
}

/**
 * The org's cell sets the real replica ceiling (shared tier: 3). Best effort:
 * without an org id or on any failure the API remains the source of truth.
 */
async function replicaCeiling(
  client: { get<T>(path: string): Promise<T> },
  orgId: string | undefined,
): Promise<number | undefined> {
  if (!orgId) return undefined;
  try {
    const { organization } = await client.get<OrganizationResponse>(
      `/organizations/${orgId}`,
    );
    return organization.cell?.maxReplicas;
  } catch {
    return undefined;
  }
}
