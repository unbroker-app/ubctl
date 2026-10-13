import { TextAttributes } from "@opentui/core";
import { useKeyboard } from "@opentui/solid";
import { createSignal, For } from "solid-js";
import { useTheme } from "../context/theme";
import { matches } from "../lib/keys";
import { useDialog } from "./dialog";

export interface DialogConfirmProps {
  title: string;
  message: string;
  confirmLabel?: string;
  /** Destructive confirmations render the confirm button in the error color. */
  danger?: boolean;
  onConfirm: () => void;
}

/** Two-button confirmation (opencode's DialogConfirm). Cancel is the default. */
export function DialogConfirm(props: DialogConfirmProps) {
  const theme = useTheme();
  const dialog = useDialog();
  const [active, setActive] = createSignal<"cancel" | "confirm">("cancel");

  const choose = (choice: "cancel" | "confirm") => {
    dialog.clear();
    if (choice === "confirm") props.onConfirm();
  };

  useKeyboard((key) => {
    if (matches(key, "left", "right", "tab", "shift+tab")) {
      key.preventDefault();
      setActive(active() === "confirm" ? "cancel" : "confirm");
    } else if (matches(key, "return")) {
      key.preventDefault();
      choose(active());
    } else if (matches(key, "y")) choose("confirm");
    else if (matches(key, "n")) choose("cancel");
  });

  const fill = (key: "cancel" | "confirm") => {
    if (key !== active()) return undefined;
    return key === "confirm" && props.danger ? theme.error : theme.primary;
  };

  return (
    <box paddingLeft={4} paddingRight={4} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={theme.text}>
          {props.title}
        </text>
        <text fg={theme.textMuted}>esc</text>
      </box>
      <text fg={theme.textMuted} wrapMode="word">
        {props.message}
      </text>
      <box flexDirection="row" justifyContent="flex-end" paddingBottom={1}>
        <For each={["cancel", "confirm"] as const}>
          {(key) => (
            <box
              paddingLeft={1}
              paddingRight={1}
              backgroundColor={fill(key)}
              onMouseUp={() => choose(key)}
            >
              <text fg={fill(key) ? theme.primaryText : theme.textMuted}>
                {key === "confirm"
                  ? (props.confirmLabel ?? "Confirm")
                  : "Cancel"}
              </text>
            </box>
          )}
        </For>
      </box>
    </box>
  );
}
