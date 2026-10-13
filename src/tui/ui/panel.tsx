import { TextAttributes, type ScrollBoxRenderable } from "@opentui/core";
import { useRouteKeys } from "../context/hints";
import { matches } from "../lib/keys";
import {
  For,
  Match,
  Show,
  Switch,
  type JSX,
  type ParentProps,
  type Resource,
} from "solid-js";
import { useTheme } from "../context/theme";

/** A titled block with a thin border, the main layout unit of every route. */
export function Panel(
  props: ParentProps<{
    title?: string;
    hint?: string;
    flexGrow?: number;
    width?: number | `${number}%`;
    height?: number;
  }>,
) {
  const theme = useTheme();
  return (
    <box
      border
      borderStyle="rounded"
      borderColor={theme.border}
      title={props.title ? ` ${props.title} ` : undefined}
      titleColor={theme.textMuted}
      bottomTitle={props.hint ? ` ${props.hint} ` : undefined}
      bottomTitleAlignment="right"
      paddingLeft={1}
      paddingRight={1}
      flexGrow={props.flexGrow}
      width={props.width}
      height={props.height}
      flexShrink={0}
    >
      {props.children}
    </box>
  );
}

/** Aligned `label  value` rows. */
export function Fields(props: {
  rows: { label: string; value: JSX.Element; color?: unknown }[];
}) {
  const theme = useTheme();
  const width = () => Math.max(0, ...props.rows.map((r) => r.label.length));
  return (
    <box>
      <For each={props.rows}>
        {(row) => (
          <box flexDirection="row" gap={2}>
            <text fg={theme.textMuted} width={width()} flexShrink={0}>
              {row.label}
            </text>
            <text fg={theme.text} wrapMode="none">
              {row.value}
            </text>
          </box>
        )}
      </For>
    </box>
  );
}

/** A big-number tile: label, value and an optional sparkline/delta line. */
export function Stat(props: {
  label: string;
  value: string;
  detail?: string;
  detailColor?: unknown;
}) {
  const theme = useTheme();
  return (
    <box flexGrow={1} flexShrink={0} minWidth={12}>
      <text fg={theme.textMuted}>{props.label}</text>
      <text fg={theme.text} attributes={TextAttributes.BOLD}>
        {props.value}
      </text>
      <Show when={props.detail}>
        <text fg={theme.primary} wrapMode="none">
          {props.detail}
        </text>
      </Show>
    </box>
  );
}

/**
 * Render a resource's three states (loading, failed, ready) without reading
 * an errored resource, which would throw inside JSX.
 */
export function Loaded<T>(props: {
  resource: Resource<T | undefined>;
  children: (value: T) => JSX.Element;
  loading?: string;
}) {
  const theme = useTheme();
  return (
    <Switch>
      <Match when={props.resource.error}>
        <text fg={theme.error} wrapMode="word">
          {String(
            (props.resource.error as Error)?.message ?? props.resource.error,
          )}
        </text>
      </Match>
      <Match when={props.resource.latest !== undefined}>
        {props.children(props.resource.latest as T)}
      </Match>
      <Match when={true}>
        <text fg={theme.textMuted}>{props.loading ?? "Loading…"}</text>
      </Match>
    </Switch>
  );
}

/** Left-aligned text table with a highlighted cursor row. */
export function Table<T>(props: {
  rows: T[];
  columns: {
    header: string;
    width?: number;
    grow?: boolean;
    value: (row: T) => string;
    color?: (row: T) => unknown;
  }[];
  selected?: number;
  onSelect?: (index: number) => void;
  empty?: string;
}) {
  const theme = useTheme();
  return (
    <box>
      <box flexDirection="row" gap={2} paddingLeft={1}>
        <For each={props.columns}>
          {(column) => (
            <text
              fg={theme.textSubtle}
              width={column.width}
              flexGrow={column.grow ? 1 : 0}
              flexShrink={column.grow ? 1 : 0}
              wrapMode="none"
            >
              {column.header.toUpperCase()}
            </text>
          )}
        </For>
      </box>
      <Show
        when={props.rows.length > 0}
        fallback={
          <text fg={theme.textMuted} paddingLeft={1}>
            {props.empty ?? "(none)"}
          </text>
        }
      >
        <For each={props.rows}>
          {(row, index) => {
            const active = () => props.selected === index();
            return (
              <box
                flexDirection="row"
                gap={2}
                paddingLeft={1}
                backgroundColor={
                  active() ? theme.backgroundSelected : undefined
                }
                onMouseUp={() => props.onSelect?.(index())}
              >
                <For each={props.columns}>
                  {(column) => (
                    <text
                      fg={
                        (column.color?.(row) as never) ??
                        (active() ? theme.text : theme.text)
                      }
                      width={column.width}
                      flexGrow={column.grow ? 1 : 0}
                      flexShrink={column.grow ? 1 : 0}
                      wrapMode="none"
                      attributes={active() ? TextAttributes.BOLD : 0}
                    >
                      {column.value(row)}
                    </text>
                  )}
                </For>
              </box>
            );
          }}
        </For>
      </Show>
    </box>
  );
}

/**
 * Vertical scroll container for a route's body, so content taller than the
 * terminal scrolls (mouse wheel, PgUp/PgDn, Home/End) instead of squeezing
 * every panel.
 */
export function RouteScroll(props: ParentProps) {
  let scroll: ScrollBoxRenderable | undefined;
  useRouteKeys((key) => {
    if (!scroll) return;
    const page = Math.max(1, scroll.height - 2);
    if (matches(key, "pagedown")) scroll.scrollBy(page);
    else if (matches(key, "pageup")) scroll.scrollBy(-page);
    else if (matches(key, "home")) scroll.scrollTo(0);
    else if (matches(key, "end")) scroll.scrollTo(scroll.scrollHeight);
  });
  return (
    <scrollbox
      ref={(r: ScrollBoxRenderable) => (scroll = r)}
      flexGrow={1}
      scrollbarOptions={{ visible: false }}
      contentOptions={{ flexDirection: "column", gap: 1 }}
    >
      {props.children}
    </scrollbox>
  );
}
