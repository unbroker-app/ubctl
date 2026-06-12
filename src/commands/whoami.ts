import { Command } from "commander";
import { resolveContext } from "../context";
import { authedClientFor } from "../api/factory";
import { ApiError } from "../api/client";
import type { AccountResponse } from "../api/types";
import { CliError } from "../util/errors";
import { print, printJson } from "../util/output";

export function whoamiCommand(): Command {
  return new Command("whoami")
    .description("Show the authenticated account and active organization")
    .action(async (_opts: unknown, cmd: Command) => {
      const ctx = resolveContext(cmd.optsWithGlobals());
      const client = authedClientFor(ctx);

      let res: AccountResponse;
      try {
        res = await client.get<AccountResponse>("/account");
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          throw new CliError("token rejected — run `ubctl login` again");
        }
        throw err;
      }

      if (ctx.json) {
        printJson({ ...res.account, apiUrl: ctx.apiUrl });
        return;
      }
      const { account } = res;
      print(`Account: ${account.name} <${account.email}>`);
      print(`Org:     ${account.team.name} (${account.team.uuid})`);
      print(`API:     ${ctx.apiUrl}`);
    });
}
