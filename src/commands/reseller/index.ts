import type { Command } from "commander";
import { dropletsCommand } from "./compute";
import { databasesCommand } from "./databases";
import { kubernetesCommand } from "./kubernetes";
import {
  firewallsCommand,
  loadBalancersCommand,
  vpcsCommand,
} from "./networking";
import { spacesCommand } from "./spaces";

/** The DigitalOcean-reseller resource commands (top-level, not under a group). */
export function resellerCommands(): Command[] {
  return [
    dropletsCommand(),
    databasesCommand(),
    kubernetesCommand(),
    firewallsCommand(),
    loadBalancersCommand(),
    vpcsCommand(),
    spacesCommand(),
  ];
}
