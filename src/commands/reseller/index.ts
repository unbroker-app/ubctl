import type { Command } from "commander";
import { dropletsCommand } from "./compute";
import { databasesCommand } from "./databases";

/** Cloud resource commands backed by routes implemented by the control plane. */
export function resellerCommands(): Command[] {
  return [dropletsCommand(), databasesCommand()];
}
