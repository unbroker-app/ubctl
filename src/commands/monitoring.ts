import { Command } from "commander";
import { authed, withJson } from "./helpers";
import { print, printJson, printTable } from "../util/output";
import { positiveNumber, positiveInteger } from "../util/validate";

interface Policy {
  id: string;
  name: string;
  kind: "metric" | "uptime";
  serviceId?: string | null;
  url?: string | null;
  metric?: string | null;
  comparator?: string | null;
  threshold?: number | null;
  windowMinutes: number;
  enabled: boolean;
  lastStatus: string;
  lastValue?: number | null;
  lastError?: string | null;
  lastCheckedAt?: number | null;
}

export function monitoringCommand(): Command {
  const monitoring = new Command("monitoring")
    .aliases(["monitor"])
    .description("Service metric alerts and HTTPS uptime checks");

  withJson(
    monitoring
      .command("ls")
      .alias("list")
      .description("List monitoring policies")
      .action(async (_opts: unknown, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const { policies } = await client.get<{ policies: Policy[] }>(
          "/monitoring/policies",
        );
        if (ctx.json) return printJson(policies);
        printTable(
          policies.map((p) => ({
            id: p.id,
            name: p.name,
            kind: p.kind,
            target: p.serviceId ?? p.url ?? "-",
            status: p.lastStatus,
            checked: p.lastCheckedAt
              ? new Date(p.lastCheckedAt).toISOString()
              : "-",
          })),
          [
            { key: "id", header: "id" },
            { key: "name", header: "name" },
            { key: "kind", header: "kind" },
            { key: "target", header: "target" },
            { key: "status", header: "status" },
            { key: "checked", header: "checked" },
          ],
        );
      }),
  );

  withJson(
    monitoring
      .command("alert-create")
      .description("Create a service metric alert")
      .requiredOption("--name <name>", "policy name")
      .requiredOption("--service <id>", "service id")
      .requiredOption(
        "--metric <metric>",
        "cpu, memory, restarts, unhealthy, ready_percent",
      )
      .requiredOption("--compare <direction>", "above or below")
      .requiredOption("--value <number>", "threshold")
      .option("--window <minutes>", "averaging window", "5")
      .action(
        async (
          opts: {
            name: string;
            service: string;
            metric: string;
            compare: string;
            value: string;
            window: string;
          },
          cmd: Command,
        ) => {
          const { ctx, client } = authed(cmd);
          const { policy } = await client.post<{ policy: Policy }>(
            "/monitoring/alerts",
            {
              name: opts.name,
              serviceId: opts.service,
              metric: opts.metric,
              comparator: opts.compare,
              threshold: positiveNumber(opts.value, "value"),
              windowMinutes: positiveInteger(opts.window, "window", 1440),
              enabled: true,
            },
          );
          if (ctx.json) return printJson(policy);
          print(`Created alert ${policy.id}`);
        },
      ),
  );

  withJson(
    monitoring
      .command("uptime-create")
      .description("Create an HTTPS uptime check")
      .requiredOption("--name <name>", "check name")
      .requiredOption("--url <url>", "public HTTPS URL")
      .action(async (opts: { name: string; url: string }, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const { policy } = await client.post<{ policy: Policy }>(
          "/monitoring/uptime",
          { name: opts.name, url: opts.url, enabled: true },
        );
        if (ctx.json) return printJson(policy);
        print(`Created uptime check ${policy.id}`);
      }),
  );

  withJson(
    monitoring
      .command("check <id>")
      .description("Evaluate a policy now")
      .action(async (id: string, _opts: unknown, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const { policy } = await client.post<{ policy: Policy }>(
          `/monitoring/policies/${id}/check`,
        );
        if (ctx.json) return printJson(policy);
        print(
          `${policy.name}: ${policy.lastStatus}${policy.lastValue == null ? "" : ` (${policy.lastValue})`}`,
        );
        if (policy.lastError) print(`detail: ${policy.lastError}`);
      }),
  );

  monitoring
    .command("rm <id>")
    .description("Delete a monitoring policy")
    .action(async (id: string, _opts: unknown, cmd: Command) => {
      const { client } = authed(cmd);
      await client.delete(`/monitoring/policies/${id}`);
      print(`Deleted monitoring policy ${id}`);
    });
  return monitoring;
}
