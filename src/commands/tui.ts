import { Command } from "commander";
import { resolveContext, type GlobalOptions } from "../context";
import { authedClientFor } from "../api/factory";
import { ApiError } from "../api/client";
import type { ProfileResponse } from "../api/types";
import { loadConfig } from "../config/store";
import { CliError } from "../util/errors";
import { tuiAvailable } from "../runtime";
import type { Session } from "../tui/context/api";

/** OpenTUI renders through Bun's FFI; the npm build runs on Node. */
export function tuiSupported(): boolean {
  return tuiAvailable();
}

/** Resolve credentials and identity for the TUI header, failing like `whoami`. */
export async function loadSession(opts: GlobalOptions): Promise<Session> {
  const ctx = resolveContext(opts);
  const client = authedClientFor(ctx);
  let profile: ProfileResponse;
  try {
    profile = await client.get<ProfileResponse>("/profile");
  } catch (err) {
    if (err instanceof ApiError && err.status === 401)
      throw new CliError("token rejected — run `ubctl login` again");
    throw err;
  }
  const p = profile.profile;
  const identity =
    p.identityType === "api_token"
      ? p.tokenName
        ? `token "${p.tokenName}"`
        : "API token"
      : p.email
        ? `${p.name} <${p.email}>`
        : p.name;
  return {
    client,
    ctx,
    identity,
    orgId: ctx.org ?? profile.orgId,
    contextName: loadConfig().currentContext,
  };
}

export async function runTui(opts: GlobalOptions): Promise<void> {
  if (!tuiSupported())
    throw new CliError(
      "the interactive UI needs the standalone ubctl binary (install with scripts/install.sh) or Bun; the npm package runs on Node",
    );
  if (!process.stdout.isTTY || !process.stdin.isTTY)
    throw new CliError("the interactive UI needs a terminal (TTY)");
  const session = await loadSession(opts);
  const { launchTui } = await import("../tui/launch");
  // Switching saved contexts only makes sense when no flag or UBCTL_* variable
  // pins the API URL, token or org: those would silently override the
  // context and send its token to the wrong place.
  const env = process.env;
  const pinned =
    opts.apiUrl ||
    opts.org ||
    env.UBCTL_TOKEN ||
    env.UBCTL_API_URL ||
    env.UBCTL_ORG;
  await launchTui(
    session,
    pinned
      ? undefined
      : () => loadSession({ trace: opts.trace, retries: opts.retries }),
  );
}

export function tuiCommand(): Command {
  return new Command("tui")
    .alias("ui")
    .description(
      "Open the interactive dashboard (services, analytics, resources, scale)",
    )
    .action(async (_opts: unknown, cmd: Command) => {
      await runTui(cmd.optsWithGlobals());
    });
}
