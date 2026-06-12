import { Command } from "commander";
import type { OrganizationsResponse } from "../api/types";
import { authed, withJson } from "./helpers";
import { printJson, printTable } from "../util/output";

export function orgsCommand(): Command {
  return withJson(
    new Command("orgs")
      .description("List organizations you belong to")
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
}
