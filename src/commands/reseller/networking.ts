import { Command } from "commander";
import type {
  FirewallsResponse,
  FirewallResponse,
  LoadBalancersResponse,
  VpcsResponse,
} from "../../api/reseller-types";
import { authed, withJson } from "../helpers";
import { print, printJson, printTable } from "../../util/output";

export function firewallsCommand(): Command {
  const fw = new Command("firewalls").description("Manage cloud firewalls");

  withJson(
    fw
      .command("ls")
      .description("List firewalls")
      .action(async (_opts: unknown, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const { firewalls } = await client.get<FirewallsResponse>("/firewalls");
        if (ctx.json) return printJson(firewalls);
        printTable(
          firewalls.map((f) => ({
            id: f.id,
            name: f.name,
            status: f.status,
            rules: f.inboundRules.length,
            droplets: f.dropletIds.length,
          })),
          [
            { key: "id", header: "id" },
            { key: "name", header: "name" },
            { key: "status", header: "status" },
            { key: "rules", header: "rules" },
            { key: "droplets", header: "droplets" },
          ],
        );
      }),
  );

  withJson(
    fw
      .command("get <id>")
      .description("Show a firewall")
      .action(async (id: string, _opts: unknown, cmd: Command) => {
        const { client } = authed(cmd);
        const { firewall } = await client.get<FirewallResponse>(
          `/firewalls/${id}`,
        );
        printJson(firewall);
      }),
  );

  fw
    .command("rm <id>")
    .description("Delete a firewall")
    .action(async (id: string, _opts: unknown, cmd: Command) => {
      const { client } = authed(cmd);
      await client.delete(`/firewalls/${id}`);
      print(`Deleted firewall ${id}`);
    });

  return fw;
}

export function loadBalancersCommand(): Command {
  return withJson(
    new Command("lb")
      .description("List load balancers")
      .action(async (_opts: unknown, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const { load_balancers } = await client.get<LoadBalancersResponse>(
          "/load_balancers",
        );
        if (ctx.json) return printJson(load_balancers);
        printTable(load_balancers, [
          { key: "id", header: "id" },
          { key: "name", header: "name" },
          { key: "status", header: "status" },
          { key: "region", header: "region" },
          { key: "ip", header: "ip" },
          { key: "healthy", header: "healthy" },
          { key: "targets", header: "targets" },
        ]);
      }),
  );
}

export function vpcsCommand(): Command {
  return withJson(
    new Command("vpcs")
      .description("List VPCs")
      .action(async (_opts: unknown, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const { vpcs } = await client.get<VpcsResponse>("/vpcs");
        if (ctx.json) return printJson(vpcs);
        printTable(vpcs, [
          { key: "id", header: "id" },
          { key: "name", header: "name" },
          { key: "region", header: "region" },
          { key: "ipRange", header: "ip range" },
          { key: "resourceCount", header: "resources" },
          { key: "isDefault", header: "default" },
        ]);
      }),
  );
}
