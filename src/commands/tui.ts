import { Command } from "commander";
import { resolveContext, type GlobalOptions } from "../context";
import { authedClientFor } from "../api/factory";
import { ApiError } from "../api/client";
import type { ProfileResponse } from "../api/types";
import { loadConfig } from "../config/store";
import { CliError } from "../util/errors";
import type { Session } from "../tui/context/api";

/** OpenTUI renders through Bun's FFI; the npm build runs on Node. */
export function tuiSupported(): boolean {
  return "Bun" in globalThis;
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
  await launchTui(session, () => loadSession(opts));
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
