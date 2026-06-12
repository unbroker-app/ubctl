import { Command } from "commander";
import { loadConfig, clearConfigKey, configPath } from "../config/store";
import { print } from "../util/output";

export function logoutCommand(): Command {
  return new Command("logout")
    .description("Remove the saved API token (keeps api-url and org)")
    .action(() => {
      if (!loadConfig().token) {
        print("Not logged in — nothing to do.");
        return;
      }
      clearConfigKey("token");
      print(`Logged out. Token removed from ${configPath()}`);
    });
}
