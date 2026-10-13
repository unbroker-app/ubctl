import { Command } from "commander";
import type { DropletsResponse, DropletResponse } from "../../api/cloud-types";
import { authed, withJson } from "../helpers";
import { print, printJson, printTable } from "../../util/output";

/**
 * `ubctl servers` — virtual servers. The API resource is still called
 * `droplets`, so `ubctl droplets` stays as an alias for existing scripts.
 */
export function serversCommand(): Command {
  const servers = new Command("servers")
    .alias("droplets")
    .description("Manage servers (virtual machines)");

  withJson(
    servers
      .command("ls")
      .description("List servers")
      .action(async (_opts: unknown, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const { droplets: rows } =
          await client.get<DropletsResponse>("/droplets");
        if (ctx.json) return printJson(rows);
        printTable(rows, [
          { key: "id", header: "id" },
          { key: "name", header: "name" },
          { key: "status", header: "status" },
          { key: "region", header: "region" },
          { key: "size", header: "size" },
          { key: "ipv4", header: "ipv4" },
        ]);
      }),
  );

  withJson(
    servers
      .command("get <id>")
      .description("Show a server")
      .action(async (id: string, _opts: unknown, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const { droplet: server } = await client.get<DropletResponse>(
          `/droplets/${id}`,
        );
        if (ctx.json) return printJson(server);
        print(`id:     ${server.id}`);
        print(`name:   ${server.name}`);
        print(`status: ${server.status}`);
        print(`region: ${server.region}`);
        print(
          `size:   ${server.size} (${server.vcpus} vCPU, ${server.memoryGb}GB RAM, ${server.diskGb}GB disk)`,
        );
        print(`image:  ${server.image}`);
        print(`ipv4:   ${server.ipv4}`);
      }),
  );

  for (const [name, path, label] of [
    ["reboot", "reboot", "Rebooting"],
    ["power-off", "power_off", "Powering off"],
    ["power-on", "power_on", "Powering on"],
  ] as const) {
    servers
      .command(`${name} <id>`)
      .description(`${label.replace(/ing\b/, "")} a server`)
      .action(async (id: string, _opts: unknown, cmd: Command) => {
        const { client } = authed(cmd);
        await client.post(`/droplets/${id}/${path}`, {});
        print(`${label} server ${id}…`);
      });
  }

  servers
    .command("rm <id>")
    .description("Destroy a server")
    .action(async (id: string, _opts: unknown, cmd: Command) => {
      const { client } = authed(cmd);
      await client.delete(`/droplets/${id}`);
      print(`Destroyed server ${id}`);
    });

  return servers;
}
