import { Command } from "commander";
import type { EnvVarsResponse, EnvVarResponse } from "../../api/types";
import { ApiError } from "../../api/client";
import { authed, withJson } from "../helpers";
import { print, printJson, printTable } from "../../util/output";

export function envCommand(): Command {
  const env = new Command("env").description(
    "Manage service environment variables",
  );

  withJson(
    env
      .command("ls <serviceId>")
      .description("List env vars (values masked)")
      .action(async (serviceId: string, _opts: unknown, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const { envVars } = await client.get<EnvVarsResponse>(
          `/apps/services/${serviceId}/env`,
        );
        if (ctx.json) return printJson(envVars);
        printTable(envVars, [
          { key: "key", header: "key" },
          { key: "maskedValue", header: "value" },
        ]);
      }),
  );

  env
    .command("set <serviceId> <KEY> <VALUE>")
    .description("Set an env var (creates or updates)")
    .action(
      async (
        serviceId: string,
        key: string,
        value: string,
        _opts: unknown,
        cmd: Command,
      ) => {
        const { client } = authed(cmd);
        // Upsert: POST creates; on 409 (already set) fall back to PUT by key.
        try {
          await client.post<EnvVarResponse>(`/apps/services/${serviceId}/env`, {
            key,
            value,
          });
        } catch (err) {
          if (err instanceof ApiError && err.status === 409) {
            await client.put<EnvVarResponse>(
              `/apps/services/${serviceId}/env/${key}`,
              { value },
            );
          } else {
            throw err;
          }
        }
        print(`Set ${key} on ${serviceId}. Redeploy to apply.`);
      },
    );

  env
    .command("rm <serviceId> <KEY>")
    .description("Remove an env var")
    .action(
      async (serviceId: string, key: string, _opts: unknown, cmd: Command) => {
        const { client } = authed(cmd);
        await client.delete(`/apps/services/${serviceId}/env/${key}`);
        print(`Removed ${key} from ${serviceId}. Redeploy to apply.`);
      },
    );

  return env;
}
