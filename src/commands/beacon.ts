import { Command } from "commander";
import type {
  BeaconProjectsResponse,
  BeaconProjectResponse,
  BeaconSettingsResponse,
  BeaconUsageResponse,
  BeaconChannelsResponse,
  BeaconChannelValueResponse,
  BeaconTokenResponse,
} from "../api/beacon-types";
import { authed, withJson } from "./helpers";
import { print, printJson, printTable } from "../util/output";
import { age } from "../util/format";
import { CliError } from "../util/errors";

/** `ubctl beacon …` — manage Beacon realtime pub/sub projects. */
export function beaconCommand(): Command {
  const beacon = new Command("beacon").description(
    "Manage Beacon realtime pub/sub projects",
  );

  withJson(
    beacon
      .command("ls")
      .description("List beacon projects")
      .action(async (_opts: unknown, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const { projects } = await client.get<BeaconProjectsResponse>(
          "/beacon/projects",
        );
        if (ctx.json) return printJson(projects);
        printTable(
          projects.map((p) => ({ ...p, created: age(p.createdAt) })),
          [
            { key: "id", header: "id" },
            { key: "name", header: "name" },
            { key: "status", header: "status" },
            { key: "created", header: "created" },
          ],
        );
      }),
  );

  withJson(
    beacon
      .command("get <id>")
      .description("Show a beacon project")
      .action(async (id: string, _opts: unknown, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const { project } = await client.get<BeaconProjectResponse>(
          `/beacon/projects/${id}`,
        );
        if (ctx.json) return printJson(project);
        print(`id:        ${project.id}`);
        print(`name:      ${project.name}`);
        print(`status:    ${project.status}`);
        print(`publicKey: ${project.publicKey ?? "-"}`);
        print(`created:   ${age(project.createdAt)}`);
      }),
  );

  withJson(
    beacon
      .command("create")
      .description("Create a beacon project")
      .requiredOption("--name <name>", "project name")
      .action(async (opts: { name: string }, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const { project } = await client.post<BeaconProjectResponse>(
          "/beacon/projects",
          { name: opts.name },
        );
        if (ctx.json) return printJson(project);
        print(`Created beacon project ${project.name} (${project.id})`);
        if (project.publicKey) print(`publicKey: ${project.publicKey}`);
      }),
  );

  beacon
    .command("rm <id>")
    .description("Delete a beacon project")
    .action(async (id: string, _opts: unknown, cmd: Command) => {
      const { client } = authed(cmd);
      await client.delete(`/beacon/projects/${id}`);
      print(`Deleted beacon project ${id}`);
    });

  for (const state of ["enable", "disable"] as const) {
    beacon
      .command(`${state} <id>`)
      .description(`${state === "enable" ? "Activate" : "Deactivate"} a beacon project`)
      .action(async (id: string, _opts: unknown, cmd: Command) => {
        const { client } = authed(cmd);
        const { project } = await client.post<BeaconProjectResponse>(
          `/beacon/projects/${id}/${state}`,
        );
        print(`${project.name} is now ${project.status}`);
      });
  }

  beacon
    .command("token <id>")
    .description("Mint a short-lived test token for the project")
    .action(async (id: string, _opts: unknown, cmd: Command) => {
      const { client } = authed(cmd);
      const { token } = await client.post<BeaconTokenResponse>(
        `/beacon/projects/${id}/token`,
      );
      print(token);
    });

  withJson(
    beacon
      .command("usage <id>")
      .description("Show project usage (messages, bytes, connections)")
      .action(async (id: string, _opts: unknown, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const { usage } = await client.get<BeaconUsageResponse>(
          `/beacon/projects/${id}/usage`,
        );
        if (ctx.json) return printJson(usage);
        print(`month:       ${usage.month}${usage.live ? " (live)" : ""}`);
        print(`messages:    ${usage.messages}`);
        print(`data:        ${usage.gigabytes} GB (${usage.bytes} bytes)`);
        print(`connections: ${usage.currentConnections} now, ${usage.peakConnections} peak`);
        print(`est. cost:   $${usage.estimatedCost.toFixed(2)}`);
      }),
  );

  withJson(
    beacon
      .command("channels <id>")
      .description("List channels and subscriber counts")
      .option("--q <filter>", "filter channel names by substring")
      .action(async (id: string, opts: { q?: string }, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const query = opts.q ? `?q=${encodeURIComponent(opts.q)}` : "";
        const { channels } = await client.get<BeaconChannelsResponse>(
          `/beacon/projects/${id}/channels${query}`,
        );
        if (ctx.json) return printJson(channels);
        printTable(channels, [
          { key: "channel", header: "channel" },
          { key: "subscribers", header: "subscribers" },
        ]);
      }),
  );

  beacon
    .command("channel <id>")
    .description("Show one channel's subscribers and last value")
    .requiredOption("--channel <name>", "channel name")
    .action(async (id: string, opts: { channel: string }, cmd: Command) => {
      const { client } = authed(cmd);
      const { channel } = await client.get<BeaconChannelValueResponse>(
        `/beacon/projects/${id}/channel?channel=${encodeURIComponent(opts.channel)}`,
      );
      // The last value is arbitrary JSON — print the whole record as JSON.
      printJson(channel);
    });

  beacon
    .command("publish <id>")
    .description("Publish a value on a channel")
    .requiredOption("--channel <name>", "channel name")
    .requiredOption("--data <json>", "value to publish (JSON, or a raw string)")
    .action(
      async (
        id: string,
        opts: { channel: string; data: string },
        cmd: Command,
      ) => {
        const { client } = authed(cmd);
        // Accept either JSON (objects/numbers/booleans) or a bare string.
        let data: unknown;
        try {
          data = JSON.parse(opts.data);
        } catch {
          data = opts.data;
        }
        await client.post(`/beacon/projects/${id}/publish`, {
          channel: opts.channel,
          data,
        });
        print(`Published to ${opts.channel}`);
      },
    );

  beacon.addCommand(settingsCommand());

  return beacon;
}

/** `ubctl beacon settings …` — domain allowlist + anonymous access policy. */
function settingsCommand(): Command {
  const settings = new Command("settings").description(
    "Manage a project's domain allowlist and anonymous access",
  );

  const show = (s: BeaconSettingsResponse["settings"]) => {
    print(`allowAnonymous:     ${s.allowAnonymous}`);
    print(`allowedOrigins:     ${s.allowedOrigins.join(", ") || "-"}`);
    print(`anonymousSubscribe: ${s.anonymousSubscribe.join(", ") || "-"}`);
  };

  withJson(
    settings
      .command("get <id>")
      .description("Show beacon project settings")
      .action(async (id: string, _opts: unknown, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const { settings: s } = await client.get<BeaconSettingsResponse>(
          `/beacon/projects/${id}/settings`,
        );
        if (ctx.json) return printJson(s);
        show(s);
      }),
  );

  withJson(
    settings
      .command("set <id>")
      .description("Update settings (only the provided fields change)")
      .option("--origin <origin>", "allowed origin (repeatable)", collect, [])
      .option("--anon-subscribe <pattern>", "anonymous channel pattern (repeatable)", collect, [])
      .option("--allow-anonymous", "allow keyless (anonymous) access")
      .option("--disallow-anonymous", "disallow keyless access")
      .action(
        async (
          id: string,
          opts: {
            origin: string[];
            anonSubscribe: string[];
            allowAnonymous?: boolean;
            disallowAnonymous?: boolean;
            json?: boolean;
          },
          cmd: Command,
        ) => {
          const { ctx, client } = authed(cmd);
          if (opts.allowAnonymous && opts.disallowAnonymous) {
            throw new CliError(
              "--allow-anonymous and --disallow-anonymous are mutually exclusive",
            );
          }
          // PATCH expects the full object, so read current settings and override
          // only the flags the user passed.
          const { settings: cur } = await client.get<BeaconSettingsResponse>(
            `/beacon/projects/${id}/settings`,
          );
          const body = {
            allowedOrigins: opts.origin.length ? opts.origin : cur.allowedOrigins,
            anonymousSubscribe: opts.anonSubscribe.length
              ? opts.anonSubscribe
              : cur.anonymousSubscribe,
            allowAnonymous: opts.allowAnonymous
              ? true
              : opts.disallowAnonymous
                ? false
                : cur.allowAnonymous,
          };
          const { settings: s } = await client.patch<BeaconSettingsResponse>(
            `/beacon/projects/${id}/settings`,
            body,
          );
          if (ctx.json) return printJson(s);
          show(s);
        },
      ),
  );

  return settings;
}

function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}
