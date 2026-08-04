import { Command } from "commander";
import { existsSync, statSync } from "node:fs";
import { resolveContext } from "../context";
import { configPath } from "../config/store";
import { clientFor } from "../api/factory";
import { print, printJson, printTable } from "../util/output";

export function doctorCommand(): Command {
  return new Command("doctor")
    .description("Diagnose CLI configuration and API connectivity")
    .option("--json", "output raw JSON")
    .action(async (_opts: unknown, cmd: Command) => {
      const ctx = resolveContext(cmd.optsWithGlobals());
      const checks: { check: string; status: string; detail: string }[] = [];
      const path = configPath();
      if (!existsSync(path))
        checks.push({
          check: "config",
          status: "warning",
          detail: "not found (environment authentication may still work)",
        });
      else {
        const mode = statSync(path).mode & 0o777;
        checks.push({
          check: "config",
          status: mode === 0o600 ? "ok" : "error",
          detail: `${path} mode ${mode.toString(8)}`,
        });
      }
      try {
        const health = await clientFor(ctx).get<{ status: string }>("/health");
        checks.push({
          check: "api",
          status: health.status === "ok" ? "ok" : "warning",
          detail: ctx.apiUrl,
        });
      } catch (error) {
        checks.push({
          check: "api",
          status: "error",
          detail: error instanceof Error ? error.message : String(error),
        });
      }
      checks.push({
        check: "token",
        status: ctx.token ? "ok" : "error",
        detail: ctx.token ? "configured" : "missing",
      });
      checks.push({
        check: "organization",
        status: ctx.org ? "ok" : "warning",
        detail: ctx.org ?? "API default",
      });
      if (ctx.json) return printJson(checks);
      printTable(checks, [
        { key: "check", header: "check" },
        { key: "status", header: "status" },
        { key: "detail", header: "detail" },
      ]);
      if (checks.some((check) => check.status === "error"))
        process.exitCode = 1;
      else print("\nCLI diagnostics passed.");
    });
}
