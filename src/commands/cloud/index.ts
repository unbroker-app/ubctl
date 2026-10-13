import type { Command } from "commander";
import { serversCommand } from "./servers";
import { databasesCommand } from "./databases";

/** Cloud resource commands: servers and managed databases. */
export function cloudCommands(): Command[] {
  return [serversCommand(), databasesCommand()];
}
