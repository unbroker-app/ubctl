import { Command } from "commander";
import type {
  UsageResponse,
  InvoicesResponse,
  ActivityResponse,
} from "../api/types";
import { authed, withJson } from "./helpers";
import { print, printJson, printTable } from "../util/output";

const usd = (n: number) => `$${n.toFixed(2)}`;

export function accountCommand(): Command {
  const account = new Command("account").description("Usage, invoices and activity");

  withJson(
    account
      .command("usage")
      .description("Current billing usage summary")
      .action(async (_opts: unknown, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const { usage } = await client.get<UsageResponse>("/account/usage");
        if (ctx.json) return printJson(usage);
        print(`Month to date: ${usd(usage.monthToDate)}`);
        print(`Projected:     ${usd(usage.projected)}`);
        print(`Run rate:      ${usd(usage.runRate)}/mo`);
        print(
          `Resources:     ${usage.droplets}/${usage.dropletLimit} droplets, ${usage.vcpus} vCPU, ${usage.memoryGb}GB RAM, ${usage.storageGb}GB storage`,
        );
      }),
  );

  withJson(
    account
      .command("invoices")
      .description("List invoices")
      .action(async (_opts: unknown, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const { invoices } = await client.get<InvoicesResponse>(
          "/account/invoices",
        );
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
        const { activity } = await client.get<ActivityResponse>(
          "/account/activity",
        );
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

  return account;
}
