import { Command } from "commander";
import type { SpacesResponse } from "../../api/reseller-types";
import { authed, withJson } from "../helpers";
import { printJson, printTable } from "../../util/output";

export function spacesCommand(): Command {
  return withJson(
    new Command("spaces")
      .description("List Spaces buckets")
      .action(async (_opts: unknown, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const { spaces } = await client.get<SpacesResponse>("/spaces");
        if (ctx.json) return printJson(spaces);
        printTable(spaces, [
          { key: "id", header: "id" },
          { key: "name", header: "name" },
          { key: "region", header: "region" },
          { key: "sizeGb", header: "size(GB)" },
          { key: "objects", header: "objects" },
          { key: "access", header: "access" },
        ]);
      }),
  );
}
