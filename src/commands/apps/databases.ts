import { Command, Option } from "commander";
import type {
  SelfHostedDatabaseResponse,
  Service,
  ServiceConnectionResponse,
  ServiceResponse,
  ServicesResponse,
} from "../../api/types";
import { authed, withJson } from "../helpers";
import { print, printJson, printTable } from "../../util/output";
import { integerRange, portNumber } from "../../util/validate";
import { CliError } from "../../util/errors";
import { runDatabaseTunnel } from "./database-tunnel";
import { age } from "../../util/format";

const DATABASE_IMAGES =
  /(^|\/)(postgres|redis|valkey|mongo(?:db)?|mysql|mariadb)(?::|$)/i;
const TEMPLATES = ["postgres", "redis", "mongodb", "mysql"] as const;

export function isSelfHostedDatabase(service: Service): boolean {
  return (
    service.serviceType === "image" &&
    service.volumePath != null &&
    DATABASE_IMAGES.test(service.imageRef ?? "")
  );
}

export function databasesCommand(): Command {
  const databases = new Command("databases")
    .alias("database")
    .description("Manage self-hosted databases in Apps");

  withJson(
    databases
      .command("ls")
      .description("List self-hosted databases")
      .action(async (_opts, cmd) => {
        const { ctx, client } = authed(cmd);
        const { services } =
          await client.get<ServicesResponse>("/apps/services");
        const rows = services.filter(isSelfHostedDatabase);
        if (ctx.json) return printJson(rows);
        printTable(rows, [
          { key: "id", header: "id" },
          { key: "name", header: "name" },
          { key: "imageRef", header: "engine" },
          { key: "status", header: "status" },
          { key: "volumeSizeGb", header: "volume gb" },
        ]);
      }),
  );

  withJson(
    databases
      .command("create <projectId>")
      .description("Create a self-hosted database with persistent storage")
      .requiredOption("--name <name>", "database service name")
      .addOption(
        new Option("--engine <engine>", "database engine")
          .choices(TEMPLATES)
          .makeOptionMandatory(),
      )
      .addOption(
        new Option("--volume-size <gb>", "persistent volume size in GiB")
          .argParser((v) => integerRange(v, "volume size", 10, 50))
          .default(10),
      )
      .action(
        async (
          projectId: string,
          opts: { name: string; engine: string; volumeSize: number },
          cmd,
        ) => {
          const { ctx, client } = authed(cmd);
          const result = await client.post<SelfHostedDatabaseResponse>(
            `/apps/projects/${projectId}/services`,
            {
              type: "template",
              template: opts.engine,
              name: opts.name,
              volumeSizeGb: opts.volumeSize,
            },
          );
          if (ctx.json) return printJson(result);
          print(
            `Created ${opts.engine} database ${result.service.name} (${result.service.id})`,
          );
          print(
            `Persistent volume: ${result.service.volumeSizeGb} GiB at ${result.service.volumePath}`,
          );
          print("Save these credentials — they are shown only once:");
          for (const credential of result.credentials)
            print(`${credential.key}=${credential.value}`);
          print(
            `Deploy it with: ubctl apps deploy ${result.service.id} --wait`,
          );
        },
      ),
  );

  withJson(
    databases
      .command("get <id>")
      .description("Show a self-hosted database")
      .action(async (id: string, _opts, cmd) => {
        const { ctx, client } = authed(cmd);
        const { service } = await client.get<ServiceResponse>(
          `/apps/services/${id}`,
        );
        if (!isSelfHostedDatabase(service))
          throw new CliError(`${id} is not a supported self-hosted database.`);
        if (ctx.json) return printJson(service);
        print(`id:       ${service.id}`);
        print(`name:     ${service.name} (${service.slug})`);
        print(`engine:   ${service.imageRef}`);
        print(`status:   ${service.status}`);
        print(
          `volume:   ${service.volumeSizeGb} GiB at ${service.volumePath}`,
        );
        print(`internal: ${service.host}:${service.port}`);
        print(`created:  ${age(service.createdAt)}`);
      }),
  );

  databases
    .command("connection <id>")
    .description("Reveal internal connection details")
    .action(async (id: string, _opts, cmd) => {
      const { client } = authed(cmd);
      const { connection } = await client.get<ServiceConnectionResponse>(
        `/apps/services/${id}/connection`,
      );
      printJson(connection);
    });

  databases
    .command("tunnel <id>")
    .alias("connect")
    .description("Open an encrypted local tunnel to a self-hosted database")
    .addOption(
      new Option("--port <port>", "local TCP port (0 chooses a free port)")
        .argParser(portNumber)
        .default(0),
    )
    .action((id: string, opts: { port: number }, cmd) =>
      runDatabaseTunnel(id, opts.port, cmd),
    );

  return databases;
}
