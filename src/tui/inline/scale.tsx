import { useKeyboard } from "@opentui/solid";
import type { ApiClient } from "../../api/client";
import type { Service } from "../../api/types";
import type { Context } from "../../context";
import { ApiProvider } from "../context/api";
import { DialogContextProvider, type DialogContext } from "../ui/dialog";
import { ScaleEditor } from "../ui/scale-editor";
import { ToastProvider } from "../ui/toast";
import { matches } from "../lib/keys";
import { runInline } from "./host";

export interface ScaleEditResult {
  service: Service;
  deploy: boolean;
}

/**
 * The dashboard's scale editor, inline under `ubctl apps scale`. A small
 * dialog shim maps "close" to finishing the prompt, so the component is the
 * same one the TUI uses and validates the same way.
 */
export function editScale(
  client: ApiClient,
  ctx: Context,
  orgId: string,
  service: Service,
): Promise<ScaleEditResult | undefined> {
  return runInline<ScaleEditResult>(18, (finish) => {
    let saved: ScaleEditResult | undefined;
    let escape: (() => boolean) | undefined;
    let busy = false;
    const dialog: DialogContext = {
      replace() {},
      clear: () => finish(saved),
      open: true,
      onEscape(handler) {
        escape = handler;
      },
      setBusy(next) {
        busy = next;
      },
      dismiss() {
        if (busy) return;
        if (escape?.()) return;
        finish(undefined);
      },
    };
    return (
      <ApiProvider
        session={{ client, ctx, identity: "", orgId }}
        refreshMs={3_600_000}
      >
        <ToastProvider>
          <DialogContextProvider value={dialog}>
            <EscapeBridge
              onEscape={() => dialog.dismiss()}
              onCancel={() => {
                // ctrl+c cancels even mid-edit, but never mid-save.
                if (!busy) finish(undefined);
              }}
            />
            <ScaleEditor
              service={service}
              deferDeploy
              onSaved={(s, deploy) => (saved = { service: s, deploy })}
            />
          </DialogContextProvider>
        </ToastProvider>
      </ApiProvider>
    );
  });
}

/** esc leaves an inline edit first, then closes; ctrl+c always cancels. */
function EscapeBridge(props: { onEscape: () => void; onCancel: () => void }) {
  useKeyboard((key) => {
    if (matches(key, "ctrl+c")) props.onCancel();
    else if (matches(key, "escape")) props.onEscape();
  });
  return null;
}
