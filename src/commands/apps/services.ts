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
  port?: string;
  outputDir?: string;
  rootDir?: string;
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
      .requiredOption("--repo <url>", "https://github.com/<owner>/<repo>")
      .addOption(
        new Option("--framework <fw>", "framework").choices(FRAMEWORKS),
      )
      .option("--branch <branch>", "git branch", "main")
      .option("--build <cmd>", "build command override")
      .option("--start <cmd>", "start command override")
      .option("--port <port>", "listen port (server frameworks)")
      .option("--output-dir <dir>", "static build output dir")
      .option("--root-dir <dir>", "monorepo subdir to build from")
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
        if (opts.port) body.port = Number(opts.port);
        if (opts.outputDir) body.outputDir = opts.outputDir;
        if (opts.rootDir) body.rootDir = opts.rootDir;

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
