import { Command } from "commander";
import type {
  DropletsResponse,
  DropletResponse,
} from "../../api/reseller-types";
import { authed, withJson } from "../helpers";
import { print, printJson, printTable } from "../../util/output";

export function dropletsCommand(): Command {
  const droplets = new Command("droplets").description("Manage droplets (VMs)");

  withJson(
    droplets
      .command("ls")
      .description("List droplets")
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
    droplets
      .command("get <id>")
      .description("Show a droplet")
      .action(async (id: string, _opts: unknown, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const { droplet } = await client.get<DropletResponse>(
          `/droplets/${id}`,
        );
        if (ctx.json) return printJson(droplet);
        print(`id:     ${droplet.id}`);
        print(`name:   ${droplet.name}`);
        print(`status: ${droplet.status}`);
        print(`region: ${droplet.region}`);
        print(
          `size:   ${droplet.size} (${droplet.vcpus} vCPU, ${droplet.memoryGb}GB RAM, ${droplet.diskGb}GB disk)`,
        );
        print(`image:  ${droplet.image}`);
        print(`ipv4:   ${droplet.ipv4}`);
      }),
  );

  for (const [name, path, label] of [
    ["reboot", "reboot", "Rebooting"],
    ["power-off", "power_off", "Powering off"],
    ["power-on", "power_on", "Powering on"],
  ] as const) {
    droplets
      .command(`${name} <id>`)
      .description(`${label.replace(/ing\b/, "")} a droplet`)
      .action(async (id: string, _opts: unknown, cmd: Command) => {
        const { client } = authed(cmd);
        await client.post(`/droplets/${id}/${path}`, {});
        print(`${label} droplet ${id}…`);
      });
  }

  droplets
    .command("rm <id>")
    .description("Destroy a droplet")
    .action(async (id: string, _opts: unknown, cmd: Command) => {
      const { client } = authed(cmd);
      await client.delete(`/droplets/${id}`);
      print(`Destroyed droplet ${id}`);
    });

  return droplets;
}
