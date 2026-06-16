import { Command } from "commander";
import { readFileSync } from "node:fs";
import type {
  ProjectsResponse,
  ProjectResponse,
  Project,
  Service,
  EnvVarsResponse,
  EnvVarResponse,
} from "../../api/types";
import { ApiError } from "../../api/client";
import { authed, withJson } from "../helpers";
import { print, printJson, printTable } from "../../util/output";
import { age } from "../../util/format";

/** Import/duplicate return the new project plus its instantiated services. */
interface ImportResponse {
  project: Project;
  services: Service[];
}

/** deploy-all returns the planned order: levels of services, dependency-first. */
interface DeployAllResponse {
  order: { serviceId: string; slug: string }[][];
}

export function projectsCommand(): Command {
  const projects = new Command("projects").description("Manage app projects");

  withJson(
    projects
      .command("ls")
      .description("List projects")
      .action(async (_opts: unknown, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const { projects: rows } = await client.get<ProjectsResponse>(
          "/apps/projects",
        );
        if (ctx.json) return printJson(rows);
        printTable(
          rows.map((p) => ({ ...p, created: age(p.createdAt) })),
          [
            { key: "id", header: "id" },
            { key: "name", header: "name" },
            { key: "slug", header: "slug" },
            { key: "created", header: "created" },
          ],
        );
      }),
  );

  withJson(
    projects
      .command("get <id>")
      .description("Show a project")
      .action(async (id: string, _opts: unknown, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const { project } = await client.get<ProjectResponse>(
          `/apps/projects/${id}`,
        );
        if (ctx.json) return printJson(project);
        print(`id:      ${project.id}`);
        print(`name:    ${project.name}`);
        print(`slug:    ${project.slug}`);
        print(`created: ${age(project.createdAt)}`);
      }),
  );

  withJson(
    projects
      .command("create")
      .description("Create a project")
      .requiredOption("--name <name>", "project name")
      .action(async (opts: { name: string }, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const { project } = await client.post<ProjectResponse>(
          "/apps/projects",
          { name: opts.name },
        );
        if (ctx.json) return printJson(project);
        print(`Created project ${project.name} (${project.id}), slug ${project.slug}`);
      }),
  );

  withJson(
    projects
      .command("rename <id>")
      .description("Rename a project (slug stays stable)")
      .requiredOption("--name <name>", "new name")
      .action(async (id: string, opts: { name: string }, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const { project } = await client.patch<ProjectResponse>(
          `/apps/projects/${id}`,
          { name: opts.name },
        );
        if (ctx.json) return printJson(project);
        print(`Renamed to ${project.name} (slug ${project.slug})`);
      }),
  );

  withJson(
    projects
      .command("deploy-all <id>")
      .description("Deploy every service in the project, dependency-first")
      .action(async (id: string, _opts: unknown, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const res = await client.post<DeployAllResponse>(
          `/apps/projects/${id}/deploy-all`,
        );
        if (ctx.json) return printJson(res);
        const count = res.order.reduce((n, level) => n + level.length, 0);
        print(`Queued ${count} service(s) across ${res.order.length} level(s).`);
        res.order.forEach((level, i) =>
          print(`  level ${i + 1}: ${level.map((s) => s.slug).join(", ")}`),
        );
      }),
  );

  projects
    .command("manifest <id>")
    .description("Export the project as a portable manifest (JSON)")
    .option("--values", "include secret values (default: redacted)")
    .action(async (id: string, opts: { values?: boolean }, cmd: Command) => {
      const { client } = authed(cmd);
      const query = opts.values ? "?includeValues=true" : "";
      const manifest = await client.get<unknown>(
        `/apps/projects/${id}/manifest${query}`,
      );
      // The manifest is the document itself — always emit raw JSON.
      printJson(manifest);
    });

  withJson(
    projects
      .command("import")
      .description("Create a project from a manifest file")
      .requiredOption("--file <path>", "path to a manifest JSON file")
      .option("--name <name>", "override the project name")
      .action(
        async (opts: { file: string; name?: string }, cmd: Command) => {
          const { ctx, client } = authed(cmd);
          let manifest: unknown;
          try {
            manifest = JSON.parse(readFileSync(opts.file, "utf8"));
          } catch (err) {
            const detail = err instanceof Error ? err.message : String(err);
            throw new ApiError(0, "bad_manifest", `cannot read ${opts.file}: ${detail}`);
          }
          const body: Record<string, unknown> = { manifest };
          if (opts.name) body.name = opts.name;
          const res = await client.post<ImportResponse>(
            "/apps/projects/import",
            body,
          );
          if (ctx.json) return printJson(res);
          print(`Imported project ${res.project.name} (${res.project.id})`);
          print(`Services: ${res.services.length}`);
        },
      ),
  );

  withJson(
    projects
      .command("duplicate <id>")
      .description("Clone a project within the org")
      .requiredOption("--name <name>", "name for the copy")
      .action(async (id: string, opts: { name: string }, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const res = await client.post<ImportResponse>(
          `/apps/projects/${id}/duplicate`,
          { name: opts.name },
        );
        if (ctx.json) return printJson(res);
        print(`Duplicated to ${res.project.name} (${res.project.id})`);
        print(`Services: ${res.services.length}`);
      }),
  );

  projects.addCommand(projectEnvCommand());

  projects
    .command("rm <id>")
    .description("Delete a project")
    .action(async (id: string, _opts: unknown, cmd: Command) => {
      const { client } = authed(cmd);
      await client.delete(`/apps/projects/${id}`);
      print(`Deleted project ${id}`);
    });

  return projects;
}

/** `ubctl apps projects env …` — env vars shared across a project's services. */
function projectEnvCommand(): Command {
  const env = new Command("env").description(
    "Manage project-wide environment variables",
  );

  withJson(
    env
      .command("ls <projectId>")
      .description("List project env vars (values masked)")
      .action(async (projectId: string, _opts: unknown, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const { envVars } = await client.get<EnvVarsResponse>(
          `/apps/projects/${projectId}/env`,
        );
        if (ctx.json) return printJson(envVars);
        printTable(envVars, [
          { key: "key", header: "key" },
          { key: "maskedValue", header: "value" },
        ]);
      }),
  );

  env
    .command("set <projectId> <KEY> <VALUE>")
    .description("Set a project env var (creates or updates)")
    .action(
      async (
        projectId: string,
        key: string,
        value: string,
        _opts: unknown,
        cmd: Command,
      ) => {
        const { client } = authed(cmd);
        // Upsert: POST creates; on 409 (already set) fall back to PUT by key.
        try {
          await client.post<EnvVarResponse>(`/apps/projects/${projectId}/env`, {
            key,
            value,
          });
        } catch (err) {
          if (err instanceof ApiError && err.status === 409) {
            await client.put<EnvVarResponse>(
              `/apps/projects/${projectId}/env/${key}`,
              { value },
            );
          } else {
            throw err;
          }
        }
        print(`Set ${key} on project ${projectId}. Redeploy services to apply.`);
      },
    );

  env
    .command("rm <projectId> <KEY>")
    .description("Remove a project env var")
    .action(
      async (projectId: string, key: string, _opts: unknown, cmd: Command) => {
        const { client } = authed(cmd);
        await client.delete(`/apps/projects/${projectId}/env/${key}`);
        print(`Removed ${key} from project ${projectId}. Redeploy services to apply.`);
      },
    );

  return env;
}
