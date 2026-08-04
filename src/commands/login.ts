import { Command } from "commander";
import { resolveContext } from "../context";
import { ApiClient, ApiError } from "../api/client";
import type { ProfileResponse } from "../api/types";
import { saveConfig, configPath } from "../config/store";
import { CliError } from "../util/errors";
import { promptHidden, readStdin } from "../util/prompt";
import { printJson, printPanel } from "../util/output";

interface LoginOptions {
  token?: string;
  apiUrl?: string;
  org?: string;
  stdin?: boolean;
}

export function loginCommand(): Command {
  return new Command("login")
    .description("Authenticate with an Unbroker API token and save it locally")
    .option("--token <token>", "API token (else prompted, or read from stdin)")
    .option("--api-url <url>", "API base URL to use and persist")
    .option("--org <id>", "default organization to persist")
    .option("--stdin", "read the token from stdin (for scripts/CI)")
    .action(async (opts: LoginOptions, cmd: Command) => {
      const global = (cmd.parent?.opts() ?? {}) as {
        apiUrl?: string;
        org?: string;
        json?: boolean;
      };
      // login-local flags win over the global ones, then env/file/default.
      const ctx = resolveContext({
        apiUrl: opts.apiUrl ?? global.apiUrl,
        org: opts.org ?? global.org,
        json: global.json,
      });

      const token = await obtainToken(opts);
      if (!token) throw new CliError("no token provided");

      // Validate against the API before persisting anything.
      const client = new ApiClient({ apiUrl: ctx.apiUrl, token });
      let profile: ProfileResponse;
      try {
        profile = await client.get<ProfileResponse>("/profile");
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          throw new CliError(`token rejected by ${ctx.apiUrl} (401)`);
        }
        throw err;
      }

      saveConfig({
        apiUrl: ctx.apiUrl,
        token,
        // Persist the explicitly requested org, else the token's own org.
        org: ctx.org ?? profile.orgId,
      });

      const orgId = ctx.org ?? profile.orgId;
      const identity = describeIdentity(profile);
      if (ctx.json) {
        printJson({
          authenticated: true,
          identity,
          orgId,
          apiUrl: ctx.apiUrl,
          configPath: configPath(),
        });
        return;
      }

      printPanel(
        "UNBROKER CLOUD",
        "✓ Authenticated",
        [
          { label: "Identity", value: identity },
          { label: "Org", value: orgId },
          { label: "API", value: ctx.apiUrl },
          { label: "Config", value: configPath() },
        ],
        ["Next: ubctl apps projects ls", "Help: ubctl --help"],
      );
    });
}

function describeIdentity(profile: ProfileResponse): string {
  if (profile.profile.identityType === "api_token") {
    return profile.profile.tokenName
      ? `API token "${profile.profile.tokenName}"`
      : "Organization API token";
  }
  if (profile.profile.email) {
    return `${profile.profile.name} <${profile.profile.email}>`;
  }
  return profile.profile.name;
}

/** Resolve the token from flag, piped stdin, or an interactive hidden prompt. */
async function obtainToken(opts: LoginOptions): Promise<string> {
  if (opts.token) return opts.token.trim();
  if (opts.stdin || !process.stdin.isTTY) return readStdin();
  return promptHidden("Unbroker API token: ");
}
