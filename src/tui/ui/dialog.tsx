import { useKeyboard, useTerminalDimensions } from "@opentui/solid";
import {
  createContext,
  type Accessor,
  Show,
  useContext,
  type JSX,
  type ParentProps,
} from "solid-js";
import { createStore } from "solid-js/store";
import { useTheme } from "../context/theme";

export type DialogSize = "medium" | "large";

interface DialogEntry {
  element: () => JSX.Element;
  size: DialogSize;
  onClose?: () => void;
}

export interface DialogContext {
  /** Replace whatever is open with a new dialog. */
  replace(
    element: () => JSX.Element,
    options?: { size?: DialogSize; onClose?: () => void },
  ): void;
  clear(): void;
  readonly open: boolean;
  /**
   * Let the open dialog consume `esc` (e.g. to leave an inline editor);
   * return true when handled. Reset on every replace/clear.
   */
  onEscape(handler: (() => boolean) | undefined): void;
  /**
   * While busy (e.g. a save in flight) user-initiated closes are ignored, so
   * the outcome of the request is never lost or misreported.
   */
  setBusy(busy: boolean): void;
  /** A close the user asked for (esc, ctrl+c, backdrop click). */
  dismiss(): void;
}

const ctx = createContext<DialogContext>();

/** Lets a non-modal host (the inline CLI editors) stand in for the dialog layer. */
export const DialogContextProvider = ctx.Provider;

/**
 * A single modal layer over the app (opencode's DialogProvider, trimmed to
 * what ubctl needs). While a dialog is open, route keybindings are suspended
 * and `esc` closes it.
 */
export function DialogProvider(props: ParentProps) {
  const [store, setStore] = createStore({ stack: [] as DialogEntry[] });
  const theme = useTheme();
  const dimensions = useTerminalDimensions();

  let escape: (() => boolean) | undefined;
  let busy = false;
  const value: DialogContext = {
    onEscape(handler) {
      escape = handler;
    },
    setBusy(next) {
      busy = next;
    },
    dismiss() {
      if (busy) return;
      if (escape?.()) return;
      value.clear();
    },
    replace(element, options) {
      escape = undefined;
      busy = false;
      for (const item of store.stack) item.onClose?.();
      setStore("stack", [
        { element, size: options?.size ?? "medium", onClose: options?.onClose },
      ]);
    },
    clear() {
      escape = undefined;
      busy = false;
      for (const item of store.stack) item.onClose?.();
      setStore("stack", []);
    },
    get open() {
      return store.stack.length > 0;
    },
  };

  useKeyboard((key) => {
    if (!value.open) return;
    if (key.name === "escape") {
      key.preventDefault();
      value.dismiss();
    }
  });

  const width = (size: DialogSize) => (size === "large" ? 88 : 60);

  return (
    <ctx.Provider value={value}>
      {props.children}
      <Show when={store.stack.at(-1)}>
        {(top: Accessor<DialogEntry>) => (
          <box
            position="absolute"
            left={0}
            top={0}
            zIndex={3000}
            width={dimensions().width}
            height={dimensions().height}
            alignItems="center"
            paddingTop={Math.floor(dimensions().height / 5)}
            backgroundColor={theme.overlay}
            onMouseUp={() => value.dismiss()}
          >
            <box
              width={width(top().size)}
              maxWidth={dimensions().width - 2}
              backgroundColor={theme.backgroundPanel}
              paddingTop={1}
              onMouseUp={(event: { stopPropagation(): void }) =>
                event.stopPropagation()
              }
            >
              {top().element()}
            </box>
          </box>
        )}
      </Show>
    </ctx.Provider>
  );
}

export function useDialog(): DialogContext {
  const value = useContext(ctx);
  if (!value) throw new Error("useDialog must be used within a DialogProvider");
  return value;
}
