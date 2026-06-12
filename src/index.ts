import { buildProgram } from "./program";

// Entry point for the `ubctl` binary. Commander parses argv and dispatches; a
// thrown CommanderError (bad flag, unknown command) already prints + sets the
// exit code, so we only need to guard against unexpected failures.
async function main(): Promise<void> {
  const program = buildProgram();
  await program.parseAsync(process.argv);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`ubctl: ${message}\n`);
  process.exit(1);
});
