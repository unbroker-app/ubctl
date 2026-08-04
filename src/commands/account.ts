import { Command } from "commander";
import type {
  UsageResponse,
  InvoicesResponse,
  ActivityResponse,
  BandwidthResponse,
  AlertsResponse,
  CurrentChargesResponse,
  UsageBreakdownResponse,
} from "../api/types";
import { authed, withJson } from "./helpers";
import { print, printJson, printTable } from "../util/output";

const usd = (n: number) => `$${n.toFixed(2)}`;

export function accountCommand(): Command {
  const account = new Command("account").description(
    "Usage, invoices and activity",
  );

  withJson(
    account
      .command("usage")
      .description("Current billing usage summary")
      .option("--breakdown", "show per-product usage and charges")
      .option("--month <YYYY-MM>", "usage month (implies --breakdown)")
      .action(
        async (opts: { breakdown?: boolean; month?: string }, cmd: Command) => {
          const { ctx, client } = authed(cmd);
          if (opts.breakdown || opts.month) {
            const query = opts.month
              ? `?month=${encodeURIComponent(opts.month)}`
              : "";
            const { usage } = await client.get<UsageBreakdownResponse>(
              `/account/usage-breakdown${query}`,
            );
            if (ctx.json) return printJson(usage);
            print(
              `Month:      ${usage.month}${usage.current ? " (current)" : ""}`,
            );
            print(`Accrued:    ${usd(usage.accrued)}`);
            print(`Projected:  ${usd(usage.projected)}`);
            print(
              `Credit:     ${usd(usage.credit.used)} / ${usd(usage.credit.included)}`,
            );
            print(`On demand:  ${usd(usage.onDemand)}`);
            printTable(
              usage.products.map((p) => ({
                ...p,
                charge: usd(p.charge),
                usage: p.qty == null ? "-" : `${p.qty} ${p.unit ?? ""}`.trim(),
              })),
              [
                { key: "group", header: "group" },
                { key: "label", header: "product" },
                { key: "usage", header: "usage" },
                { key: "charge", header: "charge" },
              ],
            );
            return;
          }
          const { usage } = await client.get<UsageResponse>("/account/usage");
          if (ctx.json) return printJson(usage);
          print(`Month to date: ${usd(usage.monthToDate)}`);
          print(`Projected:     ${usd(usage.projected)}`);
          print(`Run rate:      ${usd(usage.runRate)}/mo`);
          print(
            `Resources:     ${usage.droplets}/${usage.dropletLimit} droplets, ${usage.vcpus} vCPU, ${usage.memoryGb}GB RAM, ${usage.storageGb}GB storage`,
          );
        },
      ),
  );

  withJson(
    account
      .command("charges")
      .description("Show current-cycle itemized charges")
      .action(async (_opts: unknown, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const { charges } = await client.get<CurrentChargesResponse>(
          "/account/current-charges",
        );
        if (ctx.json) return printJson(charges);
        print(`Accrued:   ${usd(charges.accruedTotal)}`);
        print(`Projected: ${usd(charges.projectedTotal)}`);
        print(
          `Next bill: ${new Date(charges.cycle.nextChargeAt).toISOString().slice(0, 10)}`,
        );
        printTable(
          charges.items.map((i) => ({
            ...i,
            accrued: usd(i.accrued),
            projected: usd(i.projected),
          })),
          [
            { key: "type", header: "type" },
            { key: "name", header: "resource" },
            { key: "accrued", header: "accrued" },
            { key: "projected", header: "projected" },
          ],
        );
      }),
  );

  withJson(
    account
      .command("invoices")
      .description("List invoices")
      .action(async (_opts: unknown, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const { invoices } =
          await client.get<InvoicesResponse>("/account/invoices");
        if (ctx.json) return printJson(invoices);
        printTable(
          invoices.map((i) => ({ ...i, amount: usd(i.amount) })),
          [
            { key: "id", header: "id" },
            { key: "period", header: "period" },
            { key: "amount", header: "amount" },
            { key: "status", header: "status" },
          ],
        );
      }),
  );

  withJson(
    account
      .command("activity")
      .description("Recent account activity")
      .action(async (_opts: unknown, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const { activity } =
          await client.get<ActivityResponse>("/account/activity");
        if (ctx.json) return printJson(activity);
        printTable(activity, [
          { key: "time", header: "time" },
          { key: "actor", header: "actor" },
          { key: "action", header: "action" },
          { key: "target", header: "target" },
          { key: "kind", header: "kind" },
        ]);
      }),
  );

  withJson(
    account
      .command("bandwidth")
      .description("Outbound bandwidth over the last 24h")
      .action(async (_opts: unknown, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const { bandwidth } =
          await client.get<BandwidthResponse>("/account/bandwidth");
        if (ctx.json) return printJson(bandwidth);
        const peak = bandwidth.points.reduce((m, p) => Math.max(m, p.value), 0);
        const now = bandwidth.points[bandwidth.points.length - 1]?.value ?? 0;
        const sign = bandwidth.deltaPct >= 0 ? "+" : "";
        print(`now:   ${now} ${bandwidth.unit}`);
        print(`peak:  ${peak} ${bandwidth.unit}`);
        print(`trend: ${sign}${bandwidth.deltaPct}% vs. earlier`);
      }),
  );

  withJson(
    account
      .command("alerts")
      .description("Show whether anomaly alerts are enabled")
      .action(async (_opts: unknown, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const res = await client.get<AlertsResponse>("/account/alerts");
        if (ctx.json) return printJson(res);
        print(`Anomaly alerts: ${res.enabled ? "enabled" : "disabled"}`);
        print("Toggle them from the web dashboard (requires a session).");
      }),
  );

  return account;
}
