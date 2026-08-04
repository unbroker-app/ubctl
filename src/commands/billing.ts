import { Command } from "commander";
import type { CostBudget } from "../api/types";
import { authed, withJson } from "./helpers";
import { print, printJson } from "../util/output";
import { positiveNumber } from "../util/validate";

interface BudgetView {
  budget: CostBudget | null;
  spend: { accrued: number; projected: number };
}

export function billingCommand(): Command {
  const billing = new Command("billing").description(
    "Billing status, budgets, subscriptions and invoices",
  );
  const budget = new Command("budget").description(
    "Manage the monthly spending budget",
  );

  withJson(
    budget
      .command("get")
      .description("Show budget and current spend")
      .action(async (_opts: unknown, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const view = await client.get<BudgetView>("/billing/budget");
        if (ctx.json) return printJson(view);
        print(`Accrued:   $${view.spend.accrued.toFixed(2)}`);
        print(`Projected: $${view.spend.projected.toFixed(2)}`);
        if (!view.budget) return print("Budget:     not configured");
        print(`Budget:     $${view.budget.amount.toFixed(2)}`);
        print(`Thresholds: ${view.budget.thresholds.join(", ")}%`);
        print(
          `Forecast:   ${view.budget.includeForecast ? "enabled" : "disabled"}`,
        );
        print(
          `Email:      ${view.budget.emailEnabled ? "enabled" : "disabled"}`,
        );
        print(`Status:     ${view.budget.enabled ? "enabled" : "disabled"}`);
      }),
  );

  withJson(
    budget
      .command("set")
      .description("Set the monthly spending budget")
      .requiredOption("--amount <usd>", "monthly budget in USD")
      .option("--thresholds <csv>", "alert percentages", "50,80,100")
      .option("--no-forecast", "disable forecast alerts")
      .option("--no-email", "disable email alerts")
      .action(
        async (
          opts: {
            amount: string;
            thresholds: string;
            forecast: boolean;
            email: boolean;
          },
          cmd: Command,
        ) => {
          const { ctx, client } = authed(cmd);
          const amount = positiveNumber(opts.amount, "amount");
          const thresholds = opts.thresholds.split(",").map((raw) => {
            const value = Number(raw.trim());
            if (!Number.isInteger(value) || value < 1 || value > 100)
              throw new Error("thresholds must be integers from 1 to 100");
            return value;
          });
          const { budget: saved } = await client.put<{ budget: CostBudget }>(
            "/billing/budget",
            {
              amount,
              thresholds,
              includeForecast: opts.forecast,
              emailEnabled: opts.email,
              enabled: true,
            },
          );
          if (ctx.json) return printJson(saved);
          print(`Budget set to $${saved.amount.toFixed(2)}`);
        },
      ),
  );

  budget
    .command("rm")
    .description("Remove the monthly spending budget")
    .action(async (_opts: unknown, cmd: Command) => {
      const { client } = authed(cmd);
      await client.delete("/billing/budget");
      print("Budget removed");
    });

  billing.addCommand(budget);
  return billing;
}
