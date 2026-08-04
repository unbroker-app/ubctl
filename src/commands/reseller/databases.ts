import { Command, Option } from "commander";
import type {
  DatabasesResponse,
  DatabaseResponse,
  ConnectionResponse,
  DatabaseUsersResponse,
  DatabaseUserResponse,
  LogicalDbsResponse,
  LogicalDbResponse,
  DatabaseMetricsResponse,
} from "../../api/reseller-types";
import { authed, withJson } from "../helpers";
import { print, printJson, printTable } from "../../util/output";
import { positiveInteger, positiveNumber } from "../../util/validate";

// Engines the API accepts (databases.schema.ts createDatabaseSchema).
const ENGINES = [
  "pg",
  "mysql",
  "redis",
  "valkey",
  "mongodb",
  "kafka",
  "opensearch",
];

interface CreateOpts {
  name: string;
  engine: string;
  engineVersion: string;
  region: string;
  size: string;
  nodes: number;
  storage?: number;
  price?: number;
  tag?: string[];
}

export function databasesCommand(): Command {
  const db = new Command("db").description("Manage managed databases");

  withJson(
    db
      .command("ls")
      .description("List database clusters")
      .action(async (_opts: unknown, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const { databases } = await client.get<DatabasesResponse>("/databases");
        if (ctx.json) return printJson(databases);
        printTable(databases, [
          { key: "id", header: "id" },
          { key: "name", header: "name" },
          { key: "engine", header: "engine" },
          { key: "version", header: "version" },
          { key: "status", header: "status" },
          { key: "region", header: "region" },
          { key: "nodes", header: "nodes" },
        ]);
      }),
  );

  withJson(
    db
      .command("get <id>")
      .description("Show a database cluster")
      .action(async (id: string, _opts: unknown, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const { database } = await client.get<DatabaseResponse>(
          `/databases/${id}`,
        );
        if (ctx.json) return printJson(database);
        print(`id:      ${database.id}`);
        print(`name:    ${database.name}`);
        print(`engine:  ${database.engine} ${database.version}`);
        print(`status:  ${database.status}`);
        print(`region:  ${database.region}`);
        print(
          `nodes:   ${database.nodes} × ${database.size}, ${database.storageGb}GB`,
        );
      }),
  );

  withJson(
    db
      .command("create")
      .description("Provision a database cluster")
      .requiredOption("--name <name>", "cluster name")
      .addOption(
        new Option("--engine <engine>", "database engine")
          .choices(ENGINES)
          .makeOptionMandatory(),
      )
      .requiredOption("--engine-version <version>", "engine version, e.g. 16")
      .requiredOption("--region <region>", "region slug, e.g. nyc3")
      .requiredOption("--size <size>", "node size slug, e.g. db-s-1vcpu-1gb")
      .addOption(
        new Option("--nodes <n>", "number of nodes (1-9)")
          .argParser((value) => positiveInteger(value, "nodes", 9))
          .default(1),
      )
      .addOption(
        new Option("--storage <gb>", "storage in GB").argParser((value) =>
          positiveInteger(value, "storage"),
        ),
      )
      .addOption(
        new Option("--price <amount>", "monthly price hint").argParser(
          (value) => positiveNumber(value, "price"),
        ),
      )
      .option("--tag <tag>", "tag (repeatable)", collect, [])
      .action(async (opts: CreateOpts, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const body: Record<string, unknown> = {
          name: opts.name,
          engine: opts.engine,
          version: opts.engineVersion,
          region: opts.region,
          size: opts.size,
          num_nodes: opts.nodes,
        };
        if (opts.storage !== undefined) body.storageGb = opts.storage;
        if (opts.price !== undefined) body.pricePerMo = opts.price;
        if (opts.tag && opts.tag.length) body.tags = opts.tag;

        const { database } = await client.post<DatabaseResponse>(
          "/databases",
          body,
        );
        if (ctx.json) return printJson(database);
        print(`Provisioning database ${database.name} (${database.id})`);
        print(`status: ${database.status}`);
        print(
          `Get connection details with: ubctl db connection ${database.id}`,
        );
      }),
  );

  // The connection holds credentials — always JSON, never a formatted table.
  db.command("connection <id>")
    .description("Show connection details (credentials)")
    .action(async (id: string, _opts: unknown, cmd: Command) => {
      const { client } = authed(cmd);
      const { connection } = await client.get<ConnectionResponse>(
        `/databases/${id}/connection`,
      );
      printJson(connection);
    });

  withJson(
    db
      .command("metrics <id>")
      .description("Show point-in-time cluster metrics")
      .action(async (id: string, _opts: unknown, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const { metrics } = await client.get<DatabaseMetricsResponse>(
          `/databases/${id}/metrics`,
        );
        if (ctx.json) return printJson(metrics);
        if (!metrics.available) {
          print("No metrics available for this cluster.");
          return;
        }
        if (metrics.cpuPct !== undefined) print(`cpu:    ${metrics.cpuPct}%`);
        if (metrics.memPct !== undefined) print(`memory: ${metrics.memPct}%`);
        if (metrics.load1 !== undefined)
          print(
            `load:   ${metrics.load1} / ${metrics.load5} / ${metrics.load15}`,
          );
      }),
  );

  db.addCommand(usersCommand());
  db.addCommand(dbsCommand());

  db.command("rm <id>")
    .description("Destroy a database cluster")
    .action(async (id: string, _opts: unknown, cmd: Command) => {
      const { client } = authed(cmd);
      await client.delete(`/databases/${id}`);
      print(`Destroyed database ${id}`);
    });

  return db;
}

/** `ubctl db users …` — manage logins on a cluster. */
function usersCommand(): Command {
  const users = new Command("users").description("Manage database users");

  withJson(
    users
      .command("ls <id>")
      .description("List database users")
      .action(async (id: string, _opts: unknown, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const { users: rows } = await client.get<DatabaseUsersResponse>(
          `/databases/${id}/users`,
        );
        if (ctx.json) return printJson(rows);
        printTable(rows, [
          { key: "name", header: "name" },
          { key: "role", header: "role" },
        ]);
      }),
  );

  users
    .command("create <id> <name>")
    .description("Create a database user")
    .action(async (id: string, name: string, _opts: unknown, cmd: Command) => {
      const { client } = authed(cmd);
      const { user } = await client.post<DatabaseUserResponse>(
        `/databases/${id}/users`,
        { name },
      );
      print(`Created user ${user.name} (${user.role})`);
    });

  users
    .command("rm <id> <name>")
    .description("Delete a database user")
    .action(async (id: string, name: string, _opts: unknown, cmd: Command) => {
      const { client } = authed(cmd);
      await client.delete(`/databases/${id}/users/${name}`);
      print(`Deleted user ${name}`);
    });

  return users;
}

/** `ubctl db dbs …` — manage logical databases (schemas) in a cluster. */
function dbsCommand(): Command {
  const dbs = new Command("dbs").description("Manage logical databases");

  withJson(
    dbs
      .command("ls <id>")
      .description("List logical databases")
      .action(async (id: string, _opts: unknown, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const { dbs: rows } = await client.get<LogicalDbsResponse>(
          `/databases/${id}/dbs`,
        );
        if (ctx.json) return printJson(rows);
        printTable(rows, [{ key: "name", header: "name" }]);
      }),
  );

  dbs
    .command("create <id> <name>")
    .description("Create a logical database")
    .action(async (id: string, name: string, _opts: unknown, cmd: Command) => {
      const { client } = authed(cmd);
      const { db } = await client.post<LogicalDbResponse>(
        `/databases/${id}/dbs`,
        { name },
      );
      print(`Created logical database ${db.name}`);
    });

  dbs
    .command("rm <id> <name>")
    .description("Delete a logical database")
    .action(async (id: string, name: string, _opts: unknown, cmd: Command) => {
      const { client } = authed(cmd);
      await client.delete(`/databases/${id}/dbs/${name}`);
      print(`Deleted logical database ${name}`);
    });

  return dbs;
}

/** Commander value-collector for repeatable options (--tag a --tag b). */
function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}
