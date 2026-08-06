import { Command } from "commander";
import { projectsCommand } from "./projects";
import { servicesCommand } from "./services";
import { envCommand } from "./env";
import { domainsCommand } from "./domains";
import {
  deployCommand,
  deploymentsCommand,
  deploymentCommand,
  rollbackCommand,
  cancelDeploymentCommand,
} from "./deployments";
import { connectionsCommands } from "./connections";

/** The `apps` command group — the PaaS surface (projects, services, deploys). */
export function appsCommand(): Command {
  const apps = new Command("apps").description(
    "Deploy and manage apps (projects, services, deployments)",
  );

  apps.addCommand(projectsCommand());
  apps.addCommand(servicesCommand());
  apps.addCommand(envCommand());
  apps.addCommand(domainsCommand());
  apps.addCommand(deployCommand());
  apps.addCommand(deploymentsCommand());
  apps.addCommand(deploymentCommand());
  apps.addCommand(rollbackCommand());
  apps.addCommand(cancelDeploymentCommand());
  for (const command of connectionsCommands()) apps.addCommand(command);

  return apps;
}
