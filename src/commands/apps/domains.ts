import { Command } from "commander";
import type { DomainsResponse, DomainResponse } from "../../api/types";
import { authed, withJson } from "../helpers";
import { print, printJson, printTable } from "../../util/output";
import { age } from "../../util/format";

export function domainsCommand(): Command {
  const domains = new Command("domains").description("Manage custom domains");

  withJson(
    domains
      .command("ls <serviceId>")
      .description("List custom domains")
      .action(async (serviceId: string, _opts: unknown, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const { domains: rows } = await client.get<DomainsResponse>(
          `/apps/services/${serviceId}/domains`,
        );
        if (ctx.json) return printJson(rows);
        printTable(
          rows.map((d) => ({ ...d, created: age(d.createdAt) })),
          [
            { key: "hostname", header: "hostname" },
            { key: "status", header: "status" },
            { key: "created", header: "created" },
          ],
        );
      }),
  );

  withJson(
    domains
      .command("add <serviceId> <hostname>")
      .description("Attach a custom domain")
      .action(
        async (
          serviceId: string,
          hostname: string,
          _opts: unknown,
          cmd: Command,
        ) => {
          const { ctx, client } = authed(cmd);
          const { domain } = await client.post<DomainResponse>(
            `/apps/services/${serviceId}/domains`,
            { hostname },
          );
          if (ctx.json) return printJson(domain);
          print(`Added ${domain.hostname} (${domain.status})`);
        },
      ),
  );

  domains
    .command("rm <serviceId> <hostname>")
    .description("Detach a custom domain")
    .action(
      async (
        serviceId: string,
        hostname: string,
        _opts: unknown,
        cmd: Command,
      ) => {
        const { client } = authed(cmd);
        await client.delete(
          `/apps/services/${serviceId}/domains/${hostname}`,
        );
        print(`Removed ${hostname} from ${serviceId}`);
      },
    );

  return domains;
}
