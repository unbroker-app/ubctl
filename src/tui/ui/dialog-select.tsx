import { TextAttributes, type ScrollBoxRenderable } from "@opentui/core";
import { useKeyboard, useTerminalDimensions } from "@opentui/solid";
import { createMemo, createSignal, For, Show } from "solid-js";
import { useTheme } from "../context/theme";
import { fuzzyFilter } from "../lib/fuzzy";
import { matches } from "../lib/keys";
import { useDialog } from "./dialog";

export interface DialogSelectOption<T> {
  title: string;
  value: T;
  description?: string;
  /** Right-aligned hint, e.g. a keybinding or a status. */
  footer?: string;
  category?: string;
}

export interface DialogSelectProps<T> {
  title: string;
  placeholder?: string;
  options: DialogSelectOption<T>[];
  current?: T;
  onSelect: (option: DialogSelectOption<T>) => void;
}

/**
 * A searchable, grouped picker (opencode's DialogSelect): type to filter,
 * ↑/↓ or ctrl+p/ctrl+n to move, enter to choose. Used for the command
 * palette, the project switcher and every "pick one" flow.
 */
export function DialogSelect<T>(props: DialogSelectProps<T>) {
  const theme = useTheme();
  const dialog = useDialog();
  const dimensions = useTerminalDimensions();
  const [filter, setFilter] = createSignal("");
  const [selected, setSelected] = createSignal(
    Math.max(
      0,
      props.options.findIndex((o) => o.value === props.current),
    ),
  );
  let scroll: ScrollBoxRenderable | undefined;

  const filtered = createMemo(() =>
    fuzzyFilter(filter(), props.options, (o) => [
      o.title,
      o.category ?? "",
      o.description ?? "",
    ]),
  );
  // Grouping keeps the incoming order of categories; filtering flattens.
  const grouped = createMemo(() => {
    const groups = new Map<string, DialogSelectOption<T>[]>();
    for (const option of filtered()) {
      const key = filter() ? "" : (option.category ?? "");
      groups.set(key, [...(groups.get(key) ?? []), option]);
    }
    return [...groups.entries()];
  });
  const flat = createMemo(() => grouped().flatMap(([, options]) => options));
  const height = createMemo(() =>
    Math.max(
      3,
      Math.min(
        flat().length + grouped().length * 2,
        Math.floor(dimensions().height / 2) - 4,
      ),
    ),
  );

  function move(delta: number) {
    const count = flat().length;
    if (count === 0) return;
    const next = (((selected() + delta) % count) + count) % count;
    setSelected(next);
    scroll?.scrollTo(Math.max(0, next - 3));
  }

  useKeyboard((key) => {
    if (matches(key, "up", "ctrl+p")) {
      key.preventDefault();
      move(-1);
    } else if (matches(key, "down", "ctrl+n")) {
      key.preventDefault();
      move(1);
    } else if (matches(key, "pageup")) move(-10);
    else if (matches(key, "pagedown")) move(10);
    else if (matches(key, "return")) {
      const option = flat()[selected()];
      if (!option) return;
      key.preventDefault();
      dialog.clear();
      props.onSelect(option);
    }
  });

  return (
    <box gap={1} paddingBottom={1}>
      <box paddingLeft={4} paddingRight={4}>
        <box flexDirection="row" justifyContent="space-between">
          <text fg={theme.text} attributes={TextAttributes.BOLD}>
            {props.title}
          </text>
          <text fg={theme.textMuted}>esc</text>
        </box>
        <box paddingTop={1}>
          <input
            focused
            placeholder={props.placeholder ?? "Search"}
            placeholderColor={theme.textSubtle}
            textColor={theme.text}
            focusedTextColor={theme.text}
            focusedBackgroundColor={theme.backgroundElement}
            cursorColor={theme.primary}
            onInput={(value: string) => {
              setFilter(value);
              setSelected(0);
            }}
          />
        </box>
      </box>
      <Show
        when={flat().length > 0}
        fallback={
          <box paddingLeft={4}>
            <text fg={theme.textMuted}>No results found</text>
          </box>
        }
      >
        <scrollbox
          ref={(r: ScrollBoxRenderable) => (scroll = r)}
          height={height()}
          paddingLeft={1}
          paddingRight={1}
          scrollbarOptions={{ visible: false }}
        >
          <For each={grouped()}>
            {([category, options], index) => (
              <>
                <Show when={category}>
                  <box paddingTop={index() > 0 ? 1 : 0} paddingLeft={3}>
                    <text fg={theme.accent} attributes={TextAttributes.BOLD}>
                      {category}
                    </text>
                  </box>
                </Show>
                <For each={options}>
                  {(option) => {
                    const active = () => flat()[selected()] === option;
                    const current = () =>
                      props.current !== undefined &&
                      option.value === props.current;
                    return (
                      <box
                        flexDirection="row"
                        paddingLeft={current() ? 1 : 3}
                        paddingRight={3}
                        gap={1}
                        backgroundColor={
                          active() ? theme.primary : theme.backgroundPanel
                        }
                        onMouseMove={() => setSelected(flat().indexOf(option))}
                        onMouseUp={() => {
                          dialog.clear();
                          props.onSelect(option);
                        }}
                      >
                        <Show when={current()}>
                          <text
                            fg={active() ? theme.primaryText : theme.primary}
                          >
                            ●
                          </text>
                        </Show>
                        <text
                          flexGrow={1}
                          wrapMode="none"
                          fg={active() ? theme.primaryText : theme.text}
                          attributes={active() ? TextAttributes.BOLD : 0}
                        >
                          {option.title}
                          <Show when={option.description}>
                            <span
                              style={{
                                fg: active()
                                  ? theme.primaryText
                                  : theme.textMuted,
                              }}
                            >
                              {" "}
                              {option.description}
                            </span>
                          </Show>
                        </text>
                        <Show when={option.footer}>
                          <text
                            flexShrink={0}
                            fg={active() ? theme.primaryText : theme.textMuted}
                          >
                            {option.footer}
                          </text>
                        </Show>
                      </box>
                    );
                  }}
                </For>
              </>
            )}
          </For>
        </scrollbox>
      </Show>
    </box>
  );
}
