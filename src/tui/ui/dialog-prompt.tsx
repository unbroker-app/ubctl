import { TextAttributes } from "@opentui/core";
import { createSignal, Show } from "solid-js";
import { useTheme } from "../context/theme";
import { useDialog } from "./dialog";

export interface DialogPromptProps {
  title: string;
  description?: string;
  value?: string;
  placeholder?: string;
  /** Return an error message to keep the dialog open, or nothing to accept. */
  validate?: (value: string) => string | undefined;
  onSubmit: (value: string) => void;
}

/** Single-line input dialog (opencode's DialogPrompt) with inline validation. */
export function DialogPrompt(props: DialogPromptProps) {
  const theme = useTheme();
  const dialog = useDialog();
  const [error, setError] = createSignal<string>();
  const [value, setValue] = createSignal(props.value ?? "");

  const submit = () => {
    const problem = props.validate?.(value().trim());
    if (problem) return setError(problem);
    dialog.clear();
    props.onSubmit(value().trim());
  };

  return (
    <box paddingLeft={4} paddingRight={4} paddingBottom={1} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={theme.text}>
          {props.title}
        </text>
        <text fg={theme.textMuted}>esc</text>
      </box>
      <Show when={props.description}>
        <text fg={theme.textMuted} wrapMode="word">
          {props.description}
        </text>
      </Show>
      <input
        focused
        value={props.value ?? ""}
        placeholder={props.placeholder}
        placeholderColor={theme.textSubtle}
        textColor={theme.text}
        focusedTextColor={theme.text}
        focusedBackgroundColor={theme.backgroundElement}
        cursorColor={theme.primary}
        onInput={(next: string) => {
          setValue(next);
          setError(undefined);
        }}
        onSubmit={submit}
      />
      <Show
        when={error()}
        fallback={<text fg={theme.textSubtle}>enter to apply</text>}
      >
        <text fg={theme.error}>{error()}</text>
      </Show>
    </box>
  );
}
