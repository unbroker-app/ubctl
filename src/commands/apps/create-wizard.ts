import type { ApiClient } from "../../api/client";
import type { Framework } from "../../api/types";
import type {
  GithubBranchesResponse,
  GithubReposResponse,
} from "../../api/github-types";
import { ask, pick, projectId as pickProject } from "../../interactive";
import type { Context } from "../../context";

/** Framework choices in the order a newcomer should read them. */
export const FRAMEWORK_CHOICES: {
  value: Framework;
  title: string;
  hint: string;
}[] = [
  {
    value: "nixpacks",
    title: "Auto-detect",
    hint: "Nixpacks figures out the build",
  },
  { value: "next", title: "Next.js", hint: "server-rendered React" },
  { value: "astro", title: "Astro", hint: "static or SSR" },
  { value: "node", title: "Node.js", hint: "any HTTP server (set --port)" },
  { value: "vite", title: "Vite", hint: "static build" },
  { value: "react", title: "React", hint: "static build" },
  { value: "vue", title: "Vue", hint: "static build" },
  { value: "static", title: "Static site", hint: "serve files as-is" },
  { value: "worker", title: "Worker", hint: "background process, no URL" },
];

export interface CreateAnswers {
  projectId: string;
  name: string;
  repo: string;
  branch: string;
  framework: Framework;
  githubInstallation?: number;
}

/** A service-name default from a repo URL: "acme/web-store" → "web-store". */
export function nameFromRepo(url: string): string {
  const last =
    url
      .replace(/\.git$/, "")
      .split("/")
      .filter(Boolean)
      .pop() ?? "";
  return last
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Ask only for what the flags left out. Connected GitHub repositories are
 * offered first (with their branches), so a private repo needs no
 * installation id lookup; any HTTPS URL can still be typed in.
 */
export async function createWizard(
  ctx: Context,
  client: ApiClient,
  given: Partial<CreateAnswers> & { branchGiven: boolean },
  validateRepo: (url: string) => string | undefined,
): Promise<CreateAnswers> {
  const projectId = await pickProject(ctx, client, given.projectId);

  let repo = given.repo;
  let branch = given.branchGiven ? given.branch : undefined;
  let installation = given.githubInstallation;
  let defaultBranch = "main";
  if (!repo) {
    const { repos } = await client
      .get<GithubReposResponse>("/apps/github/repos")
      .catch(() => ({ repos: [] }));
    const MANUAL = "__manual__";
    const choice = repos.length
      ? await pick<string>({
          message: "Repository",
          choices: [
            ...repos.map((r) => ({
              title: r.fullName,
              value: r.fullName,
              hint: `${r.private ? "private" : "public"} · ${r.defaultBranch}`,
            })),
            {
              title: "Another URL…",
              value: MANUAL,
              hint: "GitHub, GitLab or Bitbucket",
            },
          ],
        })
      : MANUAL;
    const chosen = repos.find((r) => r.fullName === choice);
    if (chosen) {
      repo = chosen.htmlUrl;
      defaultBranch = chosen.defaultBranch;
      installation ??= chosen.installationId;
      if (!branch && chosen.installationId) {
        const [owner, name] = chosen.fullName.split("/");
        const q = new URLSearchParams({
          installationId: String(chosen.installationId),
          owner: owner!,
          repo: name!,
        });
        const { branches } = await client
          .get<GithubBranchesResponse>(`/apps/github/branches?${q}`)
          .catch(() => ({ branches: [] as string[] }));
        if (branches.length > 1)
          branch = await pick({
            message: "Branch",
            initial: defaultBranch,
            choices: branches.map((b) => ({
              title: b,
              value: b,
              hint: b === defaultBranch ? "default" : undefined,
            })),
          });
      }
    } else {
      repo = await ask({
        message: "Repository URL",
        placeholder: "https://github.com/acme/web",
        validate: validateRepo,
      });
    }
  }
  branch ??= given.branchGiven ? given.branch : defaultBranch;

  const name =
    given.name ??
    (await ask({
      message: "Service name",
      initial: nameFromRepo(repo),
      validate: (v) =>
        v.length >= 1 && v.length <= 51 ? undefined : "1 to 51 characters",
    }));

  const framework =
    given.framework ??
    (await pick<Framework>({
      message: "Framework",
      choices: FRAMEWORK_CHOICES,
    }));

  return {
    projectId,
    name,
    repo,
    branch: branch ?? "main",
    framework,
    githubInstallation: installation,
  };
}
