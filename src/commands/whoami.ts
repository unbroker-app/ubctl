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

      const legacyTokenIdentity =
        res.account.uuid === "demo" && ctx.token?.startsWith("ub_live_");
      const account = legacyTokenIdentity
        ? {
            ...res.account,
            uuid: `token:${res.account.team.uuid}`,
            name: "Organization API token",
            email: "",
            identityType: "api_token" as const,
          }
        : res.account;

      if (ctx.json) {
        printJson({ ...account, apiUrl: ctx.apiUrl });
        return;
      }
      if (account.identityType === "api_token") {
        print(
          account.tokenName
            ? `Identity: API token "${account.tokenName}"`
            : "Identity: Organization API token",
        );
      } else {
        print(`Account: ${account.name} <${account.email}>`);
      }
      print(`Org:     ${account.team.name} (${account.team.uuid})`);
      print(`API:     ${ctx.apiUrl}`);
    });
}
