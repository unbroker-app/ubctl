import { TextAttributes } from "@opentui/core";
import { useTerminalDimensions } from "@opentui/solid";
import {
  createContext,
  type Accessor,
  createSignal,
  onCleanup,
  Show,
  useContext,
  type ParentProps,
} from "solid-js";
import { useTheme } from "../context/theme";
import { SplitBorder } from "./border";

export type ToastVariant = "info" | "success" | "warning" | "error";

export interface ToastOptions {
  title?: string;
  message: string;
  variant: ToastVariant;
  duration?: number;
}

interface ToastContext {
  show(options: ToastOptions): void;
  error(err: unknown): void;
  readonly current: ToastOptions | undefined;
}

const ctx = createContext<ToastContext>();

export function ToastProvider(props: ParentProps) {
  const [current, setCurrent] = createSignal<ToastOptions>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const value: ToastContext = {
    show(options) {
      if (timer) clearTimeout(timer);
      setCurrent(options);
      timer = setTimeout(() => setCurrent(undefined), options.duration ?? 4000);
      timer.unref?.();
    },
    error(err) {
      value.show({
        variant: "error",
        title: "Request failed",
        message: err instanceof Error ? err.message : String(err),
        duration: 6000,
      });
    },
    get current() {
      return current();
    },
  };
  onCleanup(() => timer && clearTimeout(timer));

  return <ctx.Provider value={value}>{props.children}</ctx.Provider>;
}

export function useToast(): ToastContext {
  const value = useContext(ctx);
  if (!value) throw new Error("useToast must be used within a ToastProvider");
  return value;
}

/** The floating toast in the top-right corner (opencode's ToastSurface). */
export function Toast() {
  const toast = useToast();
  const theme = useTheme();
  const dimensions = useTerminalDimensions();
  const color = (variant: ToastVariant) => theme[variant];

  return (
    <Show when={toast.current}>
      {(current: Accessor<ToastOptions>) => (
        <box
          position="absolute"
          top={1}
          right={2}
          zIndex={4000}
          maxWidth={Math.min(60, dimensions().width - 6)}
          border={SplitBorder.border}
          customBorderChars={SplitBorder.customBorderChars}
          borderColor={color(current().variant)}
        >
          <box
            paddingLeft={2}
            paddingRight={2}
            paddingTop={1}
            paddingBottom={1}
            backgroundColor={theme.backgroundElement}
          >
            <Show when={current().title}>
              <text attributes={TextAttributes.BOLD} fg={theme.text}>
                {current().title}
              </text>
            </Show>
            <text fg={theme.text} wrapMode="word">
              {current().message}
            </text>
          </box>
        </box>
      )}
    </Show>
  );
}
