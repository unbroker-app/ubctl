import { TextAttributes } from "@opentui/core";
import { useKeyboard, usePaste } from "@opentui/solid";
import { createMemo, createSignal, For, Show } from "solid-js";
import { useTheme } from "../context/theme";
import { fuzzyFilter } from "../lib/fuzzy";
import { matches } from "../lib/keys";
import { runInline } from "./host";

/**
 * Inline prompts for interactive commands: pick one of many, type a value,
 * or confirm. Each renders in a small footer under the command's output and
 * resolves to `undefined` when the user cancels.
 */

export interface Choice<T> {
  title: string;
  value: T;
  /** Muted text after the title, e.g. a project or status. */
  hint?: string;
}

export interface SelectOptions<T> {
  message: string;
  choices: Choice<T>[];
  /** Value to start on (e.g. the current setting). */
  initial?: T;
}

const VISIBLE = 8;

/** Pasted text as one line: terminals deliver a paste as a single event. */
export function pastedText(bytes: Uint8Array): string {
  return (
    new TextDecoder()
      .decode(bytes)
      .replace(/[\r\n\t]+/g, " ")
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x1f\x7f]/g, "")
      .trim()
  );
}

function isPrintable(name: string, sequence: string): boolean {
  if (name === "space") return true;
  return sequence.length === 1 && sequence >= " " && sequence !== "\x7f";
}

export function Select<T>(props: {
  options: SelectOptions<T>;
  finish: (value: T | undefined) => void;
}) {
  const theme = useTheme();
  const [filter, setFilter] = createSignal("");
  const start = Math.max(
    0,
    props.options.choices.findIndex((c) => c.value === props.options.initial),
  );
  const [cursor, setCursor] = createSignal(start);
  const filtered = createMemo(() =>
    fuzzyFilter(filter(), props.options.choices, (c) => [
      c.title,
      c.hint ?? "",
    ]),
  );
  // Keep the cursor inside a window of VISIBLE rows.
  const offset = createMemo(() =>
    Math.max(
      0,
      Math.min(cursor() - VISIBLE + 1, filtered().length - VISIBLE, cursor()),
    ),
  );
  const visible = () => filtered().slice(offset(), offset() + VISIBLE);
  const titleWidth = Math.min(
    32,
    Math.max(8, ...props.options.choices.map((c) => c.title.length)),
  );

  useKeyboard((key) => {
    const count = filtered().length;
    if (matches(key, "escape", "ctrl+c")) return props.finish(undefined);
    if (matches(key, "return")) {
      const choice = filtered()[cursor()];
      if (choice) props.finish(choice.value);
      return;
    }
    if (matches(key, "up", "ctrl+p"))
      return setCursor((c) => (count ? (c - 1 + count) % count : 0));
    if (matches(key, "down", "ctrl+n", "tab"))
      return setCursor((c) => (count ? (c + 1) % count : 0));
    if (matches(key, "backspace")) {
      setFilter((f) => f.slice(0, -1));
      return setCursor(0);
    }
    if (!key.ctrl && !key.meta && isPrintable(key.name, key.sequence)) {
      setFilter((f) => f + (key.name === "space" ? " " : key.sequence));
      setCursor(0);
    }
  });
  usePaste((event) => {
    setFilter((f) => f + pastedText(event.bytes));
    setCursor(0);
  });

  return (
    <box flexDirection="column" paddingLeft={1}>
      <text>
        <span style={{ fg: theme.primary }}>? </span>
        <span style={{ fg: theme.text }}>
          <b>{props.options.message}</b>
        </span>
        <span style={{ fg: theme.textSubtle }}>
          {filter() ? `  ${filter()}▏` : "  type to filter"}
        </span>
      </text>
      <For each={visible()}>
        {(choice) => {
          const active = () => filtered()[cursor()] === choice;
          return (
            <text wrapMode="none">
              <span style={{ fg: active() ? theme.primary : theme.textSubtle }}>
                {active() ? "› " : "  "}
              </span>
              <span
                style={{
                  fg: active() ? theme.text : theme.textMuted,
                  attributes: active() ? TextAttributes.BOLD : 0,
                }}
              >
                {choice.title.padEnd(titleWidth)}
              </span>
              <span style={{ fg: theme.textSubtle }}>
                {choice.hint ? `  ${choice.hint}` : ""}
              </span>
            </text>
          );
        }}
      </For>
      <Show when={filtered().length === 0}>
        <text fg={theme.textMuted}> no matches</text>
      </Show>
      <text fg={theme.textSubtle}>
        {filtered().length > VISIBLE
          ? `  ${cursor() + 1}/${filtered().length} · `
          : "  "}
        ↑↓ move · enter select · esc cancel
      </text>
    </box>
  );
}

export function select<T>(options: SelectOptions<T>): Promise<T | undefined> {
  const rows = Math.min(VISIBLE, Math.max(1, options.choices.length));
  return runInline<T>(rows + 2, (finish) => (
    <Select options={options} finish={finish} />
  ));
}

export interface InputOptions {
  message: string;
  initial?: string;
  placeholder?: string;
  /** Hide what is typed (tokens, passwords). */
  secret?: boolean;
  /** Return an error message to reject the value. */
  validate?: (value: string) => string | undefined;
}

export function Input(props: {
  options: InputOptions;
  finish: (value: string | undefined) => void;
}) {
  const theme = useTheme();
  const [value, setValue] = createSignal(props.options.initial ?? "");
  const [error, setError] = createSignal<string>();

  useKeyboard((key) => {
    if (matches(key, "escape", "ctrl+c")) return props.finish(undefined);
    if (matches(key, "return")) {
      const text = value().trim();
      const problem = props.options.validate?.(text);
      if (problem) return setError(problem);
      return props.finish(text);
    }
    if (matches(key, "backspace")) return setValue((v) => v.slice(0, -1));
    if (matches(key, "ctrl+u")) return setValue("");
    if (!key.ctrl && !key.meta && isPrintable(key.name, key.sequence)) {
      setValue((v) => v + (key.name === "space" ? " " : key.sequence));
      setError(undefined);
    }
  });
  usePaste((event) => {
    setValue((v) => v + pastedText(event.bytes));
    setError(undefined);
  });

  const shown = () =>
    props.options.secret ? "•".repeat(value().length) : value();

  return (
    <box flexDirection="column" paddingLeft={1}>
      <text>
        <span style={{ fg: theme.primary }}>? </span>
        <span style={{ fg: theme.text }}>
          <b>{props.options.message}</b>
        </span>
      </text>
      <text wrapMode="none">
        <span style={{ fg: theme.primary }}>› </span>
        <Show
          when={value()}
          fallback={
            <span style={{ fg: theme.textSubtle }}>
              {props.options.placeholder ?? ""}
            </span>
          }
        >
          <span style={{ fg: theme.text }}>{shown()}</span>
        </Show>
        <span style={{ fg: theme.primary }}>▏</span>
      </text>
      <Show
        when={error()}
        fallback={
          <text fg={theme.textSubtle}> enter confirm · esc cancel</text>
        }
      >
        <text fg={theme.error}> {error()}</text>
      </Show>
    </box>
  );
}

export function input(options: InputOptions): Promise<string | undefined> {
  return runInline<string>(3, (finish) => (
    <Input options={options} finish={finish} />
  ));
}

export function Confirm(props: {
  message: string;
  initial: boolean;
  finish: (value: boolean | undefined) => void;
}) {
  const theme = useTheme();
  const [yes, setYes] = createSignal(props.initial);
  useKeyboard((key) => {
    if (matches(key, "escape", "ctrl+c")) return props.finish(undefined);
    if (matches(key, "y")) return props.finish(true);
    if (matches(key, "n")) return props.finish(false);
    if (matches(key, "left", "right", "tab", "h", "l"))
      return setYes((v) => !v);
    if (matches(key, "return")) props.finish(yes());
  });
  const option = (label: string, on: boolean) => (
    <span
      style={{
        fg: on ? theme.primaryText : theme.textMuted,
        bg: on ? theme.primary : undefined,
      }}
    >
      {` ${label} `}
    </span>
  );
  return (
    <box paddingLeft={1}>
      <text>
        <span style={{ fg: theme.primary }}>? </span>
        <span style={{ fg: theme.text }}>
          <b>{props.message}</b>
        </span>
        <span> </span>
        {option("Yes", yes())}
        <span> </span>
        {option("No", !yes())}
      </text>
    </box>
  );
}

export function confirm(
  message: string,
  initial = false,
): Promise<boolean | undefined> {
  return runInline<boolean>(1, (finish) => (
    <Confirm message={message} initial={initial} finish={finish} />
  ));
}
