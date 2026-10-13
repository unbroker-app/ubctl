import { Command, Option } from "commander";
import type { MetricRange, UsageResponse } from "../../api/types";
import {
  fleetResources,
  serviceResources,
  seriesPeak,
  seriesValues,
  usageTotals,
  type LiveMetrics,
} from "../../api/resources";
import { authed, withJson } from "../helpers";
import { print, printJson, printTable } from "../../util/output";
import {
  describeLimits,
  describeScale,
  describeWindow,
} from "../../util/scale";
import { gauge, sparkline } from "../../util/chart";
import { bytes } from "../../util/format";
import { serviceId as resolveService } from "../../interactive";

const METRIC_RANGES: MetricRange[] = ["15m", "1h", "6h", "24h", "7d", "30d"];

function usage(used: number | null, limit: number | null, unit: string) {
  if (used === null) return "-";
  const value = `${Math.round(used)}${unit}`;
  return limit ? `${value}/${limit}${unit}` : value;
}

function pct(used: number | null, limit: number | null): string {
  if (used === null || !limit) return "-";
  return `${Math.round((used / limit) * 100)}%`;
}

function liveNote(live: LiveMetrics): string | undefined {
  if (live.state === "gated") return `Live usage unavailable: ${live.message}`;
  if (live.state === "error") return `Live usage unavailable: ${live.message}`;
  if (!live.metrics) return "Not running — no live usage.";
  return undefined;
}

/** `ubctl apps services resources <id>` — scale, limits and live usage. */
export function serviceResourcesCommand(): Command {
  return withJson(
    new Command("resources")
      .description("Show a service's scale, limits and live CPU/memory usage")
      .argument("[id]", "service id (picked interactively if omitted)")
      .addOption(
        new Option(
          "--range <range>",
          "add usage history sparklines for this window",
        ).choices(METRIC_RANGES),
      )
      .action(
        async (
          idArg: string | undefined,
          opts: { range?: MetricRange },
          cmd: Command,
        ) => {
          const { ctx, client } = authed(cmd);
          const id = await resolveService(ctx, client, idArg);
          const data = await serviceResources(client, id, opts.range);
          if (ctx.json) return printJson(data);

          const { service, live, series } = data;
          print(
            `service:  ${service.name} (${service.id}) · ${service.status}`,
          );
          print(`scale:    ${describeScale(service)}`);
          print(`limits:   ${describeLimits(service)}`);
          const window = describeWindow(service);
          if (window) print(`window:   ${window}`);
          if (service.needsRedeploy)
            print(
              `pending:  changes apply on the next deploy (ubctl apps deploy ${service.id})`,
            );

          const note = liveNote(live);
          if (note || live.state !== "ok" || !live.metrics) {
            print("");
            print(note ?? "");
            return;
          }
          const metrics = live.metrics;
          const totals = usageTotals(metrics);
          print(
            `live:     ${metrics.replicas.ready}/${metrics.replicas.desired} replicas ready · ${metrics.limits.cpuMillicores}m CPU · ${metrics.limits.memoryMiB}Mi memory per pod`,
          );
          print(`cpu:      ${gauge(totals.cpu ?? 0, totals.cpuLimit ?? 0)}`);
          print(
            `memory:   ${gauge(totals.memory ?? 0, totals.memoryLimit ?? 0)}`,
          );
          print("");
          printTable(
            metrics.pods.map((p) => ({
              pod: p.pod,
              state: p.state,
              cpu: usage(p.cpuMillicores, metrics.limits.cpuMillicores, "m"),
              cpuPct: pct(p.cpuMillicores, metrics.limits.cpuMillicores),
              memory: usage(p.memoryMiB, metrics.limits.memoryMiB, "Mi"),
              memPct: pct(p.memoryMiB, metrics.limits.memoryMiB),
              restarts: p.restarts,
            })),
            [
              { key: "pod", header: "pod" },
              { key: "state", header: "state" },
              { key: "cpu", header: "cpu" },
              { key: "cpuPct", header: "cpu%" },
              { key: "memory", header: "memory" },
              { key: "memPct", header: "mem%" },
              { key: "restarts", header: "restarts" },
            ],
          );

          if (series) {
            print("");
            print(`history (${opts.range}):`);
            const rows: [string, string, (v: number) => string][] = [
              ["cpu", "cpu_millicores", (v) => `${Math.round(v)}m`],
              ["memory", "memory_mib", (v) => `${Math.round(v)}Mi`],
              ["net in", "rx_bytes_per_sec", (v) => `${bytes(v)}/s`],
              ["net out", "tx_bytes_per_sec", (v) => `${bytes(v)}/s`],
              ["replicas", "ready_replicas", (v) => String(Math.round(v))],
            ];
            for (const [label, name, fmt] of rows) {
              const values = seriesValues(series, name);
              if (values.length === 0) continue;
              const peak = seriesPeak(series, name) ?? Math.max(...values);
              const avg = values.reduce((a, b) => a + b, 0) / values.length;
              print(
                `  ${label.padEnd(9)}${sparkline(values, 40)}  avg ${fmt(avg)} · peak ${fmt(peak)}`,
              );
            }
          }
        },
      ),
  );
}

/** `ubctl apps resources [--project <id>]` — usage across every service. */
export function fleetResourcesCommand(): Command {
  return withJson(
    new Command("resources")
      .description(
        "Show scale, limits and live usage for every service, plus account totals",
      )
      .option("--project <id>", "only services in this project")
      .action(async (opts: { project?: string }, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const [rows, account] = await Promise.all([
          fleetResources(client, opts.project),
          client.get<UsageResponse>("/account/usage").catch(() => undefined),
        ]);
        if (ctx.json)
          return printJson({ services: rows, account: account?.usage });

        printTable(
          rows.map(({ service, live }) => {
            const metrics = live.state === "ok" ? live.metrics : null;
            const totals = usageTotals(metrics);
            return {
              id: service.id,
              name: service.name,
              status: service.status,
              replicas: metrics
                ? `${metrics.replicas.ready}/${metrics.replicas.desired}`
                : String(service.replicas ?? "-"),
              scale: describeScale(service),
              cpu: usage(totals.cpu, totals.cpuLimit, "m"),
              memory: usage(totals.memory, totals.memoryLimit, "Mi"),
            };
          }),
          [
            { key: "id", header: "id" },
            { key: "name", header: "name" },
            { key: "status", header: "status" },
            { key: "replicas", header: "ready" },
            { key: "scale", header: "scale" },
            { key: "cpu", header: "cpu" },
            { key: "memory", header: "memory" },
          ],
        );
        const gated = rows.find((r) => r.live.state === "gated");
        if (gated) print(`\n${liveNote(gated.live)}`);
        if (account) {
          const u = account.usage;
          print(
            `\naccount: ${u.vcpus} vCPU · ${u.memoryGb} GB memory · ${u.storageGb} GB storage · ${u.droplets}/${u.dropletLimit} servers`,
          );
        }
      }),
  );
}
