import { Command } from "commander";
import { VERSION } from "./version";
import { loginCommand } from "./commands/login";
import { logoutCommand } from "./commands/logout";
import { whoamiCommand } from "./commands/whoami";
import { appsCommand } from "./commands/apps";
import { tokensCommand } from "./commands/tokens";
import { accountCommand } from "./commands/account";
import { orgsCommand } from "./commands/orgs";

/**
 * Build the root `ubctl` command tree. Kept separate from the entrypoint so
 * tests can construct a fresh program and exercise it without spawning a
 * process. Resource subcommands (apps, tokens, droplets, …) are registered here
 * in later PRs.
 */
export function buildProgram(): Command {
  const program = new Command();

  program
    .name("ubctl")
    .description("Official Unbroker Cloud CLI")
    .version(VERSION, "-v, --version", "output the CLI version")
    // Global flags consumed by the API client / output layer (wired up in the
    // core PR). Declared here so `--help` documents them from the start.
    .option("--org <id>", "act against a specific organization (X-Org-Id)")
    .option("--api-url <url>", "override the Unbroker API base URL")
    .option("--json", "output raw JSON instead of formatted tables");

  // Auth & identity
  program.addCommand(loginCommand());
  program.addCommand(logoutCommand());
  program.addCommand(whoamiCommand());

  // Products
  program.addCommand(appsCommand());

  // Account management
  program.addCommand(tokensCommand());
  program.addCommand(accountCommand());
  program.addCommand(orgsCommand());

  return program;
}
