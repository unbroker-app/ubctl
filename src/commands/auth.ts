import { Command } from "commander";
import {
  loadConfig,
  removeContext,
  saveContext,
  switchContext,
} from "../config/store";
import { print, printTable } from "../util/output";
import { contextName } from "../util/validate";

export function authCommand(): Command {
  const auth = new Command("auth").description(
    "Manage named authentication contexts",
  );
  auth
    .command("ls")
    .alias("list")
    .description("List contexts")
    .action(() => {
      const config = loadConfig();
      printTable(
        Object.entries(config.contexts ?? {}).map(([name, value]) => ({
          current: config.currentContext === name ? "*" : "",
          name,
          org: value.org ?? "-",
          api: value.apiUrl ?? "-",
          authenticated: value.token ? "yes" : "no",
        })),
        [
          { key: "current", header: "" },
          { key: "name", header: "name" },
          { key: "org", header: "org" },
          { key: "api", header: "api" },
          { key: "authenticated", header: "authenticated" },
        ],
      );
    });
  auth
    .command("save <name>")
    .description("Save current credentials as a named context")
    .action((name: string) => {
      saveContext(contextName(name));
      print(`Saved and selected context ${name}`);
    });
  auth
    .command("switch <name>")
    .description("Switch to a named context")
    .action((name: string) => {
      switchContext(contextName(name));
      print(`Switched to context ${name}`);
    });
  auth
    .command("rm <name>")
    .description("Remove a named context")
    .action((name: string) => {
      removeContext(contextName(name));
      print(`Removed context ${name}`);
    });
  return auth;
}
