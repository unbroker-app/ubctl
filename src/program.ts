import { Command, Option } from "commander";
import { VERSION } from "./version";
import { loginCommand } from "./commands/login";
import { logoutCommand } from "./commands/logout";
import { whoamiCommand } from "./commands/whoami";
import { appsCommand } from "./commands/apps";
import { beaconCommand } from "./commands/beacon";
import { githubCommand } from "./commands/github";
import { tokensCommand } from "./commands/tokens";
import { accountCommand } from "./commands/account";
import { orgsCommand } from "./commands/orgs";
import { teamCommand } from "./commands/team";
import { notificationsCommand } from "./commands/notifications";
import { billingCommand } from "./commands/billing";
import { monitoringCommand } from "./commands/monitoring";
import { authCommand } from "./commands/auth";
import { completionCommand } from "./commands/completion";
import { doctorCommand } from "./commands/doctor";
import { resellerCommands } from "./commands/reseller";

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
    .option("--json", "output raw JSON instead of formatted tables")
    .addOption(
      new Option("--output <format>", "output format").choices([
        "text",
        "json",
      ]),
    )
    .option("--trace", "print HTTP method, path, status and timing")
    .option("--retries <count>", "retry 429 and 5xx responses (0-10)", "3");

  // Auth & identity
  program.addCommand(loginCommand());
  program.addCommand(authCommand());
  program.addCommand(logoutCommand());
  program.addCommand(whoamiCommand());

  // Products
  program.addCommand(appsCommand());
  program.addCommand(beaconCommand());
  program.addCommand(githubCommand());

  // Account management
  program.addCommand(tokensCommand());
  program.addCommand(accountCommand());
  program.addCommand(billingCommand());
  program.addCommand(monitoringCommand());
  program.addCommand(orgsCommand());
  program.addCommand(teamCommand());
  program.addCommand(notificationsCommand());

  // Cloud resources (DigitalOcean reseller layer)
  for (const c of resellerCommands()) program.addCommand(c);
  program.addCommand(completionCommand());
  program.addCommand(doctorCommand());

  return program;
}
