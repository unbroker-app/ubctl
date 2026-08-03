import { Command, Option } from "commander";
import type {
  ServicesResponse,
  ServiceResponse,
  LogsResponse,
  MetricsResponse,
  Framework,
} from "../../api/types";
import { authed, withJson } from "../helpers";
import { print, printJson, printTable } from "../../util/output";
import { age } from "../../util/format";
import { CliError } from "../../util/errors";
import {
  githubRepositoryUrl,
  positiveInteger,
} from "../../util/validate";

const FRAMEWORKS: Framework[] = [
  "next",
  "astro",
  "node",
  "react",
  "vue",
  "vite",
  "static",
];

interface CreateOpts {
  name: string;
  repo: string;
  branch: string;
  framework: Framework;
  build?: string;
  start?: string;
  port?: number;
  outputDir?: string;
  rootDir?: string;
  githubInstallation?: number;
}

interface UpdateOpts {
  name?: string;
  branch?: string;
  framework?: Framework;
  port?: number;
  build?: string;
  start?: string;
  imageRef?: string;
  autoDeploy?: string;
}

export function servicesCommand(): Command {
  const services = new Command("services").description("Manage app services");

  withJson(
    services
      .command("ls")
      .description("List services")
      .action(async (_opts: unknown, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const { services: rows } = await client.get<ServicesResponse>(
          "/apps/services",
        );
        if (ctx.json) return printJson(rows);
        printTable(
          rows.map((s) => ({ ...s, created: age(s.createdAt) })),
          [
            { key: "id", header: "id" },
            { key: "name", header: "name" },
            { key: "framework", header: "framework" },
            { key: "branch", header: "branch" },
            { key: "status", header: "status" },
            { key: "url", header: "url" },
          ],
        );
      }),
  );

  withJson(
    services
      .command("get <id>")
      .description("Show a service")
      .action(async (id: string, _opts: unknown, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const { service } = await client.get<ServiceResponse>(
          `/apps/services/${id}`,
        );
        if (ctx.json) return printJson(service);
        print(`id:        ${service.id}`);
        print(`name:      ${service.name} (${service.slug})`);
        print(`repo:      ${service.repoUrl} @ ${service.branch}`);
        print(`framework: ${service.framework}`);
        print(`status:    ${service.status}${service.needsRedeploy ? " (needs redeploy)" : ""}`);
        print(`url:       ${service.url}${service.routed ? "" : " (beta, not routed)"}`);
        if (service.domains.length) print(`domains:   ${service.domains.join(", ")}`);
        print(`created:   ${age(service.createdAt)}`);
      }),
  );

  withJson(
    services
      .command("create <projectId>")
      .description("Create a service in a project")
      .requiredOption("--name <name>", "service name")
      .addOption(
        new Option("--repo <url>", "https://github.com/<owner>/<repo>")
          .argParser(githubRepositoryUrl)
          .makeOptionMandatory(),
      )
      .addOption(
        new Option("--framework <fw>", "framework")
          .choices(FRAMEWORKS)
          .makeOptionMandatory(),
      )
      .option("--branch <branch>", "git branch", "main")
      .option("--build <cmd>", "build command override")
      .option("--start <cmd>", "start command override")
      .addOption(
        new Option("--port <port>", "listen port (server frameworks)").argParser(
          (value) => positiveInteger(value, "port", 65535),
        ),
      )
      .option("--output-dir <dir>", "static build output dir")
      .option("--root-dir <dir>", "monorepo subdir to build from")
      .addOption(
        new Option(
          "--github-installation <id>",
          "GitHub installation id (see `ubctl github installations ls`)",
        ).argParser((value) => positiveInteger(value, "GitHub installation id")),
      )
      .action(async (projectId: string, opts: CreateOpts, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const body: Record<string, unknown> = {
          name: opts.name,
          repoUrl: opts.repo,
          branch: opts.branch,
          framework: opts.framework,
        };
        if (opts.build) body.buildCommand = opts.build;
        if (opts.start) body.startCommand = opts.start;
        if (opts.port !== undefined) body.port = opts.port;
        if (opts.outputDir) body.outputDir = opts.outputDir;
        if (opts.rootDir) body.rootDir = opts.rootDir;
        if (opts.githubInstallation)
          body.githubInstallationId = opts.githubInstallation;

        const { service } = await client.post<ServiceResponse>(
          `/apps/projects/${projectId}/services`,
          body,
        );
        if (ctx.json) return printJson(service);
        print(`Created service ${service.name} (${service.id})`);
        print(`URL: ${service.url}${service.routed ? "" : " (beta)"}`);
        print(`Deploy it with: ubctl apps deploy ${service.id} --wait`);
      }),
  );

  withJson(
    services
      .command("update <id>")
      .description("Update a service's config")
      .option("--name <name>", "rename the service")
      .option("--branch <branch>", "git branch")
      .addOption(new Option("--framework <fw>", "framework").choices(FRAMEWORKS))
      .addOption(
        new Option("--port <port>", "listen port").argParser((value) =>
          positiveInteger(value, "port", 65535),
        ),
      )
      .option("--build <cmd>", "build command override")
      .option("--start <cmd>", "start command override")
      .option("--image-ref <ref>", "image reference (image services)")
      .addOption(
        new Option("--auto-deploy <bool>", "push-to-deploy on/off").choices([
          "true",
          "false",
        ]),
      )
      .action(async (id: string, opts: UpdateOpts, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const body: Record<string, unknown> = {};
        if (opts.name) body.name = opts.name;
        if (opts.branch) body.branch = opts.branch;
        if (opts.framework) body.framework = opts.framework;
        if (opts.port !== undefined) body.port = opts.port;
        if (opts.build) body.buildCommand = opts.build;
        if (opts.start) body.startCommand = opts.start;
        if (opts.imageRef) body.imageRef = opts.imageRef;
        if (opts.autoDeploy) body.autoDeploy = opts.autoDeploy === "true";
        if (Object.keys(body).length === 0) {
          print("Nothing to update — pass at least one option.");
          return;
        }
        const { service } = await client.patch<ServiceResponse>(
          `/apps/services/${id}`,
          body,
        );
        if (ctx.json) return printJson(service);
        print(`Updated service ${service.name} (${service.id})`);
        if (service.needsRedeploy)
          print("Changes need a redeploy: ubctl apps deploy " + service.id);
      }),
  );

  withJson(
    services
      .command("security <id>")
      .description("Set page access control (public/password/organization)")
      .addOption(
        new Option("--mode <mode>", "access mode")
          .choices(["public", "password", "organization"])
          .makeOptionMandatory(),
      )
      .option("--password <password>", "shared password (password mode)")
      .action(
        async (
          id: string,
          opts: { mode: string; password?: string },
          cmd: Command,
        ) => {
          const { ctx, client } = authed(cmd);
          if (opts.mode === "password" && !opts.password) {
            throw new CliError("password mode requires --password");
          }
          if (opts.mode !== "password" && opts.password) {
            throw new CliError("--password is only valid with --mode password");
          }
          const body: Record<string, unknown> = { accessMode: opts.mode };
          if (opts.password) body.password = opts.password;
          const { service } = await client.put<ServiceResponse>(
            `/apps/services/${id}/security`,
            body,
          );
          if (ctx.json) return printJson(service);
          print(`Access mode for ${service.name}: ${service.accessMode}`);
        },
      ),
  );

  services
    .command("rm <id>")
    .description("Delete a service")
    .action(async (id: string, _opts: unknown, cmd: Command) => {
      const { client } = authed(cmd);
      await client.delete(`/apps/services/${id}`);
      print(`Deleted service ${id}`);
    });

  withJson(
    services
      .command("logs <id>")
      .description("Show runtime logs")
      .action(async (id: string, _opts: unknown, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const { logs } = await client.get<LogsResponse>(
          `/apps/services/${id}/logs`,
        );
        if (ctx.json) return printJson(logs);
        for (const line of logs) print(line);
      }),
  );

  withJson(
    services
      .command("metrics <id>")
      .description("Show live CPU/memory/replica metrics")
      .action(async (id: string, _opts: unknown, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const { metrics } = await client.get<MetricsResponse>(
          `/apps/services/${id}/metrics`,
        );
        if (ctx.json) return printJson(metrics);
        if (!metrics) {
          print("No metrics — the service isn't running.");
          return;
        }
        print(`replicas: ${metrics.replicas.ready}/${metrics.replicas.desired} ready`);
        print(
          `limits:   ${metrics.limits.cpuMillicores}m CPU, ${metrics.limits.memoryMiB}Mi memory`,
        );
        printTable(metrics.pods, [
          { key: "name", header: "pod" },
          { key: "cpuMillicores", header: "cpu(m)" },
          { key: "memoryMiB", header: "mem(Mi)" },
          { key: "ready", header: "ready" },
        ]);
      }),
  );

  return services;
}
