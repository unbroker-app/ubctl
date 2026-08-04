import { ApiClient } from "./client";
import type { Context } from "../context";
import { CliError } from "../util/errors";

/** Build an API client from a resolved context (token optional). */
export function clientFor(ctx: Context, fetchFn?: typeof fetch): ApiClient {
  return new ApiClient({
    apiUrl: ctx.apiUrl,
    token: ctx.token,
    org: ctx.org,
    trace: ctx.trace,
    retries: ctx.retries,
    fetchFn,
  });
}

/**
 * Build a client, requiring a token. Throws a friendly error when the user
 * hasn't run `login` (or set UBCTL_TOKEN) — used by every authed command.
 */
export function authedClientFor(ctx: Context, fetchFn?: typeof fetch): ApiClient {
  if (!ctx.token) {
    throw new CliError(
      "not logged in — run `ubctl login` or set UBCTL_TOKEN",
    );
  }
  return clientFor(ctx, fetchFn);
}
