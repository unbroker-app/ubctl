import { execFile } from "node:child_process";

/**
 * Whether this build can render OpenTUI. It needs the Bun runtime *and* a
 * bundle that includes the TUI: the npm build (scripts/build.ts) defines
 * `process.env.UBCTL_BUILD_TUI` as "0" and stubs every TUI module, so
 * running dist/index.js under Bun must still behave like the Node CLI.
 */
export function tuiAvailable(): boolean {
  return "Bun" in globalThis && process.env.UBCTL_BUILD_TUI !== "0";
}

let foreground: Promise<boolean> | undefined;

/**
 * Whether we're the terminal's foreground job. A background job (`cmd &`)
 * still has TTY stdin/stdout, but taking over the terminal would stop it
 * with SIGTTOU. `ps` marks foreground process groups with "+"; if it can't
 * be asked, assume foreground (the conservative choice is decided by the
 * TTY checks that run first).
 */
export function isForeground(): Promise<boolean> {
  foreground ??= new Promise((resolve) => {
    execFile(
      "ps",
      ["-o", "stat=", "-p", String(process.pid)],
      { timeout: 1_000 },
      (err, stdout) => resolve(err ? true : stdout.includes("+")),
    );
  });
  return foreground;
}
