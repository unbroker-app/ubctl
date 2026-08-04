import { Command } from "commander";
import type {
  GithubInstallationsResponse,
  GithubReposResponse,
  GithubBranchesResponse,
} from "../api/github-types";
import { authed, withJson } from "./helpers";
import { print, printJson, printTable } from "../util/output";

/**
 * `ubctl github …` — read the org's connected GitHub installations and repos
 * so you can wire `apps services create` to the right repo/branch.
 *
 * Connecting an installation is an OAuth browser flow (it needs a code from
 * GitHub's redirect), so do that in the web dashboard — the CLI reads what's
 * already connected.
 */
export function githubCommand(): Command {
  const github = new Command("github").description(
    "Inspect connected GitHub installations and repositories",
  );

  github.addCommand(installationsCommand());

  withJson(
    github
      .command("repos")
      .description("List repos across the org's installations")
      .action(async (_opts: unknown, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const { repos } =
          await client.get<GithubReposResponse>("/apps/github/repos");
        if (ctx.json) return printJson(repos);
        printTable(repos, [
          { key: "fullName", header: "repo" },
          { key: "defaultBranch", header: "default" },
          { key: "private", header: "private" },
          { key: "htmlUrl", header: "url" },
        ]);
      }),
  );

  withJson(
    github
      .command("branches")
      .description("List branches of a repo")
      .requiredOption("--installation <id>", "installation id")
      .requiredOption("--owner <owner>", "repo owner")
      .requiredOption("--repo <repo>", "repo name")
      .action(
        async (
          opts: { installation: string; owner: string; repo: string },
          cmd: Command,
        ) => {
          const { ctx, client } = authed(cmd);
          const q = new URLSearchParams({
            installationId: opts.installation,
            owner: opts.owner,
            repo: opts.repo,
          });
          const { branches } = await client.get<GithubBranchesResponse>(
            `/apps/github/branches?${q.toString()}`,
          );
          if (ctx.json) return printJson(branches);
          for (const b of branches) print(b);
        },
      ),
  );

  return github;
}

function installationsCommand(): Command {
  const installations = new Command("installations").description(
    "Manage connected GitHub installations",
  );

  withJson(
    installations
      .command("ls")
      .description("List connected installations")
      .action(async (_opts: unknown, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const { installations: rows } =
          await client.get<GithubInstallationsResponse>(
            "/apps/github/installations",
          );
        if (ctx.json) return printJson(rows);
        printTable(rows, [
          { key: "installationId", header: "id" },
          { key: "accountLogin", header: "account" },
        ]);
      }),
  );

  installations
    .command("rm <id>")
    .description("Disconnect a GitHub installation")
    .action(async (id: string, _opts: unknown, cmd: Command) => {
      const { client } = authed(cmd);
      await client.delete(`/apps/github/installations/${id}`);
      print(`Disconnected installation ${id}`);
    });

  return installations;
}
