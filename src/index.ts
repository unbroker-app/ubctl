import { buildProgram } from "./program";

// Entry point for the `ubctl` binary. Commander parses argv and dispatches; a
// thrown CommanderError (bad flag, unknown command) already prints + sets the
// exit code, so we only need to guard against unexpected failures.
async function main(): Promise<void> {
  const program = buildProgram();
  await program.parseAsync(normalizeLegacyArgs(process.argv));
}

/**
 * v0.1 documented `db create --version`, but Commander's root version handler
 * intercepted it before the database command could run. Preserve that spelling
 * for scripts while advertising the unambiguous `--engine-version` going forward.
 */
export function normalizeLegacyArgs(argv: string[]): string[] {
  const normalized = [...argv];
  const db = normalized.indexOf("db", 2);
  if (db >= 0 && normalized[db + 1] === "create") {
    for (let i = db + 2; i < normalized.length; i++) {
      if (normalized[i] === "--version") normalized[i] = "--engine-version";
      else if (normalized[i]?.startsWith("--version=")) {
        normalized[i] = normalized[i]!.replace(
          /^--version=/,
          "--engine-version=",
        );
      }
    }
  }
  return normalized;
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`ubctl: ${message}\n`);
  process.exit(1);
});
