import { Command } from "commander";
import type {
  ProjectsResponse,
  ProjectResponse,
} from "../../api/types";
import { authed, withJson } from "../helpers";
import { print, printJson, printTable } from "../../util/output";
import { age } from "../../util/format";

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
