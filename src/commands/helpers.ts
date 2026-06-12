import type { Command } from "commander";
import { resolveContext } from "../context";
import type { Context } from "../context";
import { authedClientFor } from "../api/factory";
import type { ApiClient } from "../api/client";

/**
 * Resolve the context (merging this command's options with all inherited global
 * flags) and build a token-authed API client. Every authed leaf command starts
 * here. Throws CliError when not logged in.
 */
export function authed(cmd: Command): { ctx: Context; client: ApiClient } {
  const ctx = resolveContext(cmd.optsWithGlobals());
  return { ctx, client: authedClientFor(ctx) };
}

/** Add a local `--json` flag so it works after the subcommand, not just before it. */
export function withJson(cmd: Command): Command {
  return cmd.option("--json", "output raw JSON");
}

/** Sleep helper for deploy polling. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
