import { Command, Option } from "commander";
import type { TokensResponse, CreateTokenResponse } from "../api/types";
import { authed, withJson } from "./helpers";
import { print, printJson, printTable } from "../util/output";

export function tokensCommand(): Command {
  const tokens = new Command("tokens").description("Manage API tokens");

  withJson(
    tokens
      .command("ls")
      .description("List API tokens (secrets are never shown)")
      .action(async (_opts: unknown, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const { tokens: rows } =
          await client.get<TokensResponse>("/api-tokens");
        if (ctx.json) return printJson(rows);
        printTable(rows, [
          { key: "id", header: "id" },
          { key: "name", header: "name" },
          { key: "scope", header: "scope" },
          { key: "prefix", header: "prefix" },
          { key: "lastUsed", header: "last used" },
        ]);
      }),
  );

  withJson(
    tokens
      .command("create")
      .description("Create an API token (the secret is shown once)")
      .requiredOption("--name <name>", "token name")
      .addOption(
        new Option("--scope <scope>", "token scope")
          .choices(["read", "read/write"])
          .default("read/write"),
      )
      .action(async (opts: { name: string; scope: string }, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const res = await client.post<CreateTokenResponse>("/api-tokens", {
          name: opts.name,
          scope: opts.scope,
        });
        if (ctx.json) return printJson(res);
        print(`Created token "${res.token.name}" (${res.token.id})`);
        print("");
        print("  " + res.secret);
        print("");
        print("This is the only time the secret is shown — store it now.");
      }),
  );

  tokens
    .command("rm <id>")
    .description("Revoke an API token")
    .action(async (id: string, _opts: unknown, cmd: Command) => {
      const { client } = authed(cmd);
      await client.delete(`/api-tokens/${id}`);
      print(`Revoked token ${id}`);
    });

  return tokens;
}
