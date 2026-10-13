import { Command, Option } from "commander";
import type {
  TrafficBreakdown,
  TrafficDimension,
  TrafficOverview,
  TrafficRange,
} from "../api/types";
import { authed, withJson } from "./helpers";
import { print, printJson, printTable } from "../util/output";
import { bar, compact, percent, sparkline } from "../util/chart";
import { bytes, millis } from "../util/format";
import { integerRange } from "../util/validate";
import {
  RANGE_LABELS,
  TRAFFIC_DIMENSIONS,
  describeScope,
  stepLabel,
  trafficDimension,
  trafficKpis,
  trafficQuery,
  trafficRange,
  type TrafficScope,
} from "../util/traffic";

interface ScopeOptions {
  service?: string;
  project?: string;
  env?: "production" | "preview";
  range: TrafficRange;
  host?: string;
}

/** Scope + range flags shared by every analytics subcommand. */
function withScope(cmd: Command): Command {
  return cmd
    .option("--service <id>", "only this service")
    .option("--project <id>", "only this project (all its services)")
    .addOption(
      new Option(
        "--env <environment>",
        "production or preview traffic",
      ).choices(["production", "preview"]),
    )
    .addOption(
      new Option(
        "--range <range>",
        "24h, 7d, 30d, 90d (3m) or 365d (12m); beyond 24h needs Pro",
      )
        .argParser(trafficRange)
        .default("24h"),
    );
}

function scopeOf(opts: ScopeOptions): TrafficScope {
  return {
    serviceId: opts.service,
    projectId: opts.project,
    environment: opts.env,
  };
}

/**
 * `ubctl analytics` — traffic analytics measured at the cell's ingress:
 * visitors, page views, requests, errors, latency and top dimensions.
 */
export function analyticsCommand(): Command {
  const analytics = new Command("analytics").description(
    "Traffic analytics: visitors, page views, errors, latency and top sources",
  );

  withJson(
    withScope(
      analytics
        .command("overview", { isDefault: true })
        .description("Show traffic totals and the request timeline")
        .option("--host <hostname>", "only this hostname"),
    ).action(async (opts: ScopeOptions, cmd: Command) => {
      const { ctx, client } = authed(cmd);
      const scope = scopeOf(opts);
      const overview = await client.get<TrafficOverview>(
        `/traffic/overview${trafficQuery(scope, { range: opts.range, host: opts.host })}`,
      );
      if (ctx.json) return printJson(overview);
      printOverview(overview, scope, opts.host);
    }),
  );

  withJson(
    withScope(
      analytics
        .command("top <dimension>")
        .alias("breakdown")
        .description(
          `Rank traffic by a dimension (Pro): ${TRAFFIC_DIMENSIONS.join(", ")}`,
        )
        .addOption(
          new Option("--limit <n>", "rows to show (1-100)")
            .argParser((v) => integerRange(v, "limit", 1, 100))
            .default(10),
        ),
    ).action(
      async (
        dimensionArg: string,
        opts: ScopeOptions & { limit: number },
        cmd: Command,
      ) => {
        const { ctx, client } = authed(cmd);
        const dimension: TrafficDimension = trafficDimension(dimensionArg);
        const scope = scopeOf(opts);
        const breakdown = await client.get<TrafficBreakdown>(
          `/traffic/breakdown/${dimension}${trafficQuery(scope, { range: opts.range, limit: opts.limit })}`,
        );
        if (ctx.json) return printJson(breakdown);
        printBreakdown(breakdown, scope);
      },
    ),
  );

  return analytics;
}

function printOverview(
  overview: TrafficOverview,
  scope: TrafficScope,
  host?: string,
): void {
  const k = trafficKpis(overview);
  print(
    `Traffic · ${RANGE_LABELS[overview.range]} · ${describeScope(scope)}${host ? ` · ${host}` : ""}`,
  );
  print("");
  const unknown = overview.visitorsUnavailable ? "n/a" : undefined;
  printTable(
    [
      {
        visitors: unknown ?? compact(k.visitors),
        pageviews: compact(k.pageviews),
        requests: compact(k.requests),
        online: unknown ?? String(k.online),
        errors: `${percent(k.errorRate5xx)} 5xx · ${percent(k.errorRate4xx)} 4xx`,
        p95: millis(k.p95),
        bandwidth: bytes(k.bandwidth),
      },
    ],
    [
      { key: "visitors", header: "visitors" },
      { key: "pageviews", header: "page views" },
      { key: "requests", header: "requests" },
      { key: "online", header: "online" },
      { key: "errors", header: "errors" },
      { key: "p95", header: "p95" },
      { key: "bandwidth", header: "bandwidth" },
    ],
  );
  if (overview.buckets.length > 0) {
    print("");
    print(
      `requests  ${sparkline(
        overview.buckets.map((b) => b.requests),
        60,
      )}  (${stepLabel(overview.step)} buckets)`,
    );
    if (k.pageviews > 0)
      print(
        `pageviews ${sparkline(
          overview.buckets.map((b) => b.pageviews),
          60,
        )}`,
      );
  }
  if (overview.hosts.length > 0) {
    print("");
    const max = Math.max(...overview.hosts.map((h) => h.requests));
    printTable(
      overview.hosts.slice(0, 8).map((h) => ({
        host: h.host,
        requests: compact(h.requests),
        share: bar(h.requests, max, 20),
        bandwidth: bytes(h.bytesOut),
      })),
      [
        { key: "host", header: "hostname" },
        { key: "requests", header: "requests" },
        { key: "share", header: "" },
        { key: "bandwidth", header: "bandwidth" },
      ],
    );
  }
  if (k.bots || k.scanners) {
    print("");
    print(
      `Excluded from the totals above: ${compact(k.scanners)} scanner probes. Bots: ${compact(k.bots)} requests.`,
    );
  }
  if (overview.visitorsUnavailable)
    print(
      "Visitor counts are unavailable: this cell's ingress does not see client IPs.",
    );
  if (overview.totals.requests === 0)
    print(
      "No traffic recorded in this window. Analytics start once requests reach the service.",
    );
}

function printBreakdown(breakdown: TrafficBreakdown, scope: TrafficScope) {
  print(
    `Top ${breakdown.dimension} · ${RANGE_LABELS[breakdown.range]} · ${describeScope(scope)}${breakdown.approximate ? " · approximate" : ""}`,
  );
  print("");
  const rows = breakdown.other
    ? [...breakdown.rows, { ...breakdown.other, value: "(other)" }]
    : breakdown.rows;
  const withPages = rows.some((r) => r.pageviews);
  const withLatency = rows.some((r) => r.p95 !== undefined && r.p95 !== null);
  printTable(
    rows.map((r) => ({
      value: r.value || "(none)",
      requests: compact(r.requests),
      share: `${bar(r.share, 1, 16).padEnd(16)} ${percent(r.share)}`,
      pageviews: compact(r.pageviews ?? 0),
      errors:
        r.s5xx !== undefined || r.s4xx !== undefined
          ? `${compact(r.s4xx ?? 0)}/${compact(r.s5xx ?? 0)}`
          : "-",
      p95: millis(r.p95),
    })),
    [
      { key: "value", header: breakdown.dimension },
      { key: "requests", header: "requests" },
      { key: "share", header: "share" },
      ...(withPages
        ? [{ key: "pageviews" as const, header: "page views" }]
        : []),
      { key: "errors", header: "4xx/5xx" },
      ...(withLatency ? [{ key: "p95" as const, header: "p95" }] : []),
    ],
  );
}
