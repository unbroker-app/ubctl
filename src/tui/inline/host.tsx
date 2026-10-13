import { createCliRenderer, type CliRenderer } from "@opentui/core";
import { render } from "@opentui/solid";
import type { JSX } from "solid-js";
import { ThemeProvider } from "../context/theme";

/**
 * Run one interactive step inline, below the command's output, instead of on
 * the alternate screen. This is opencode's "mini" split-footer setup: the view
 * owns the bottom `height` rows while anything written to stdout scrolls above
 * it, so a deploy can stream its build log while the footer shows progress.
 *
 * `view` calls `finish(value)` to resolve; `finish(undefined)` means the user
 * cancelled (esc / ctrl+c).
 */
export async function runInline<T>(
  height: number,
  view: (finish: (value: T | undefined) => void) => JSX.Element,
): Promise<T | undefined> {
  const rows = process.stdout.rows || 24;
  const renderer = await createCliRenderer({
    screenMode: "split-footer",
    footerHeight: Math.max(3, Math.min(height, rows - 2)),
    externalOutputMode: "capture-stdout",
    consoleMode: "disabled",
    exitOnCtrlC: false,
    useMouse: false,
    autoFocus: false,
    clearOnShutdown: true,
    openConsoleOnError: false,
    targetFps: 30,
  });

  return new Promise<T | undefined>((resolve) => {
    let settled = false;
    const finish = (value: T | undefined) => {
      if (settled) return;
      settled = true;
      shutdown(renderer);
      // Let the terminal settle before the caller prints the outcome.
      setTimeout(() => resolve(value), 10);
    };
    void render(() => <ThemeProvider>{view(finish)}</ThemeProvider>, renderer);
  });
}

/**
 * Tear down in the order opencode uses: stop capturing stdout before leaving
 * split-footer mode so nothing printed afterwards is swallowed.
 */
function shutdown(renderer: CliRenderer): void {
  if (renderer.isDestroyed) return;
  if (renderer.externalOutputMode === "capture-stdout")
    renderer.externalOutputMode = "passthrough";
  if (renderer.screenMode === "split-footer")
    renderer.screenMode = "main-screen";
  if (!renderer.isDestroyed) renderer.destroy();
}
