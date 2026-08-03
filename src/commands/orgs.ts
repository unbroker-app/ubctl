import { Command } from "commander";
import type {
  OrganizationsResponse,
  OrganizationResponse,
  BillingResponse,
} from "../api/types";
import { authed, withJson } from "./helpers";
import { print, printJson, printTable } from "../util/output";

/**
 * `ubctl orgs …` — list and inspect organizations.
 *
 * Creating/renaming/deleting orgs, editing billing and connecting a cloud
 * provider all require a signed-in web session (not an API token), so those
 * live in the dashboard. The CLI exposes the token-readable views.
 */
export function orgsCommand(): Command {
  const orgs = withJson(
    new Command("orgs")
      .description("List and inspect organizations")
      // Bare `ubctl orgs` lists — preserved from the original single command.
      .action(async (_opts: unknown, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const { organizations } = await client.get<OrganizationsResponse>(
          "/organizations",
        );
        if (ctx.json) return printJson(organizations);
        printTable(organizations, [
          { key: "id", header: "id" },
          { key: "name", header: "name" },
          { key: "kind", header: "kind" },
          { key: "plan", header: "plan" },
        ]);
      }),
  );

  withJson(
    orgs
      .command("get <id>")
      .description("Show an organization")
      .action(async (id: string, _opts: unknown, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const { organization } = await client.get<OrganizationResponse>(
          `/organizations/${id}`,
        );
        if (ctx.json) return printJson(organization);
        print(`id:    ${organization.id}`);
        print(`name:  ${organization.name}`);
        print(`kind:  ${organization.kind}`);
        print(`plan:  ${organization.plan}`);
      }),
  );

  withJson(
    orgs
      .command("billing <id>")
      .description("Show an organization's billing details")
      .action(async (id: string, _opts: unknown, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const { billing } = await client.get<BillingResponse>(
          `/organizations/${id}/billing`,
        );
        if (ctx.json) return printJson(billing);
        print(`email:   ${billing.billingEmail || "-"}`);
        print(`company: ${billing.company || "-"}`);
        print(`address: ${billing.address || "-"}`);
        print(`city:    ${billing.city || "-"}`);
        print(`country: ${billing.country || "-"}`);
        print(`tax id:  ${billing.taxId || "-"}`);
      }),
  );

  return orgs;
}
