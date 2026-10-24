import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const MARKER = "<!-- unbroker-iac-plan -->";

interface PlanResult {
  planId: string;
  destructive: boolean;
  summary: { add: number; change: number; destroy: number; replace: number };
  changes: { action: string; address: string; effect?: string }[];
  releases?: {
    serviceKey: string;
    effect: string;
    commitSha: string | null;
    imageRef: string | null;
    pinned: boolean;
  }[];
}

interface GitHubEvent {
  pull_request?: {
    number?: number;
    head?: { sha?: string };
  };
}

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const event = (): GitHubEvent => {
  const file = process.env.GITHUB_EVENT_PATH;
  return file ? JSON.parse(readFileSync(file, "utf8")) : {};
};

async function runUbctl(args: string[]): Promise<string> {
  const entry = resolve(import.meta.dirname, "index.ts");
  const child = spawn(process.execPath, [entry, ...args], {
    cwd: process.env.GITHUB_WORKSPACE ?? process.cwd(),
    env: process.env,
    stdio: ["ignore", "pipe", "inherit"],
  });
  let stdout = "";
  child.stdout.on("data", (chunk) => (stdout += chunk));
  const code = await new Promise<number | null>((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", resolveExit);
  });
  if (code !== 0) throw new Error(`ubctl exited with code ${code}`);
  return stdout.trim();
}

async function github(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${required("GITHUB_ACTION_TOKEN")}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!response.ok)
    throw new Error(`GitHub ${response.status}: ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

export function planComment(plan: PlanResult, headSha: string): string {
  const summary = plan.summary;
  const lines = plan.changes.map(
    (change) =>
      `- \`${change.action}\` \`${change.address}\`${change.effect ? ` — **${change.effect}**` : ""}`,
  );
  const releases = (plan.releases ?? []).map((release) => {
    const revision =
      release.commitSha ?? release.imageRef ?? "configured source";
    return `- \`${release.serviceKey}\`: **${release.effect}** \`${revision}\` ${release.pinned ? "(pinned)" : "(resolved at deploy)"}`;
  });
  return [
    MARKER,
    "## Unbroker infrastructure plan",
    "",
    `Plan \`${plan.planId}\` for commit \`${headSha}\``,
    "",
    `**${summary.add}** add · **${summary.change}** change · **${summary.destroy}** destroy · **${summary.replace}** replace${plan.destructive ? " · ⚠️ **destructive**" : ""}`,
    "",
    ...(lines.length
      ? ["### Changes", ...lines, ""]
      : ["No infrastructure changes.", ""]),
    ...(releases.length ? ["### Releases", ...releases, ""] : []),
    "Merging this exact PR commit authorizes apply of the immutable saved plan.",
  ].join("\n");
}

export function commentMetadata(
  body: string,
): { planId: string; sha: string } | null {
  if (!body.includes(MARKER)) return null;
  const match = body.match(/Plan `([^`]+)` for commit `([0-9a-f]+)`/);
  return match ? { planId: match[1]!, sha: match[2]! } : null;
}

async function upsertPlanComment(
  plan: PlanResult,
  headSha: string,
): Promise<void> {
  const payload = event();
  const number = payload.pull_request?.number;
  const repository = required("GITHUB_REPOSITORY");
  if (!number) throw new Error("plan mode requires a pull_request event");
  const comments = (await github(
    `/repos/${repository}/issues/${number}/comments?per_page=100`,
  )) as { id: number; body?: string; user?: { login?: string } }[];
  const existing = comments.find(
    (comment) =>
      comment.user?.login === "github-actions[bot]" &&
      comment.body?.includes(MARKER),
  );
  const body = planComment(plan, headSha);
  if (existing)
    await github(`/repos/${repository}/issues/comments/${existing.id}`, {
      method: "PATCH",
      body: JSON.stringify({ body }),
    });
  else
    await github(`/repos/${repository}/issues/${number}/comments`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
}

async function planIdFromMergedPr(): Promise<string> {
  const payload = event();
  const number = payload.pull_request?.number;
  const headSha = payload.pull_request?.head?.sha;
  const repository = required("GITHUB_REPOSITORY");
  if (!number || !headSha)
    throw new Error("apply mode requires a merged pull_request event");
  const comments = (await github(
    `/repos/${repository}/issues/${number}/comments?per_page=100`,
  )) as { body?: string; user?: { login?: string } }[];
  const match = comments
    .filter((comment) => comment.user?.login === "github-actions[bot]")
    .map((comment) => commentMetadata(comment.body ?? ""))
    .find((metadata) => metadata?.sha === headSha);
  if (!match)
    throw new Error(
      "no reviewed Unbroker plan matches the merged PR head commit",
    );
  return match.planId;
}

function output(name: string, value: string): void {
  const file = required("GITHUB_OUTPUT");
  const delimiter = `ubctl_${Date.now()}_${name}`;
  appendFileSync(file, `${name}<<${delimiter}\n${value}\n${delimiter}\n`);
}

async function main(): Promise<void> {
  const mode = required("INPUT_MODE");
  const projectId = required("INPUT_PROJECT_ID");
  if (mode === "plan") {
    const args = ["config", "plan", projectId, "--json"];
    const environment = process.env.INPUT_ENVIRONMENT_ID?.trim();
    const file = process.env.INPUT_CONFIG_FILE?.trim();
    const partial = process.env.INPUT_PARTIAL?.trim();
    if (environment) args.push("--environment", environment);
    if (file) args.push("--file", file);
    if (partial) args.push("--partial", partial);
    const raw = await runUbctl(args);
    const plan = JSON.parse(raw) as PlanResult;
    const payload = event();
    const headSha = payload.pull_request?.head?.sha ?? required("GITHUB_SHA");
    await upsertPlanComment(plan, headSha);
    output("plan-id", plan.planId);
    output("result", raw);
    return;
  }
  if (mode !== "apply") throw new Error('INPUT_MODE must be "plan" or "apply"');
  const planId =
    process.env.INPUT_PLAN_ID?.trim() || (await planIdFromMergedPr());
  const args = [
    "config",
    "apply",
    projectId,
    "--plan",
    planId,
    "--yes",
    "--json",
  ];
  if (process.env.INPUT_CONFIRM_DESTRUCTIVE === "true")
    args.push("--confirm-destructive");
  const raw = await runUbctl(args);
  output("plan-id", planId);
  output("result", raw);
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url))
  await main();
