import { Command } from "commander";
import type {
  DatabasesResponse,
  DatabaseResponse,
  ConnectionResponse,
} from "../../api/reseller-types";
import { authed, withJson } from "../helpers";
import { print, printJson, printTable } from "../../util/output";

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
        print(`nodes:   ${database.nodes} × ${database.size}, ${database.storageGb}GB`);
      }),
  );

  // The connection holds credentials — always JSON, never a formatted table.
  db
    .command("connection <id>")
    .description("Show connection details (credentials)")
    .action(async (id: string, _opts: unknown, cmd: Command) => {
      const { client } = authed(cmd);
      const { connection } = await client.get<ConnectionResponse>(
        `/databases/${id}/connection`,
      );
      printJson(connection);
    });

  db
    .command("rm <id>")
    .description("Destroy a database cluster")
    .action(async (id: string, _opts: unknown, cmd: Command) => {
      const { client } = authed(cmd);
      await client.delete(`/databases/${id}`);
      print(`Destroyed database ${id}`);
    });

  return db;
}
