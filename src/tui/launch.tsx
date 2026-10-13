import { render } from "@opentui/solid";
import type { Session } from "./context/api";
import { App } from "./app";

/**
 * Mount the TUI on the alternate screen and resolve when the user quits.
 * Only imported through a dynamic import from `ubctl tui`, so the Node build
 * (which replaces this module with a stub) never loads OpenTUI.
 */
export async function launchTui(
  session: Session,
  reload: (() => Promise<Session>) | undefined,
): Promise<void> {
  await new Promise<void>((resolve) => {
    void render(() => <App session={session} reload={reload} />, {
      exitOnCtrlC: false,
      targetFps: 30,
      useMouse: true,
      // A failed request is shown in the view; never pop the debug console.
      openConsoleOnError: false,
      consoleMode: "disabled",
      onDestroy: resolve,
    });
  });
  // Pending refresh timers and sockets must not keep the process alive.
  process.exit(0);
}
