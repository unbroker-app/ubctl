import { TextAttributes, type ScrollBoxRenderable } from "@opentui/core";
import { useRouteKeys } from "../context/hints";
import { matches } from "../lib/keys";
import { For, Show, type JSX, type ParentProps } from "solid-js";
import type { Request } from "../context/api";
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
 * Render a request: its data once loaded, a loading line before that, and
 * the error (as a warning above stale data, or alone if nothing loaded yet).
 *
 * `children` runs once. It receives a live view of the value, so property
 * reads inside JSX update on refresh without rebuilding the subtree (which
 * would reset scroll positions and re-issue child requests).
 */
export function Loaded<T extends object>(props: {
  request: Request<T>;
  children: (value: T) => JSX.Element;
  loading?: string;
}) {
  const theme = useTheme();
  const live = new Proxy({} as T, {
    get: (_, key) =>
      (props.request.value() as Record<PropertyKey, unknown>)?.[key],
    has: (_, key) => key in ((props.request.value() as object) ?? {}),
  });
  const message = () => {
    const err = props.request.error() as Error | undefined;
    return err ? (err.message ?? String(err)) : undefined;
  };
  return (
    <>
      <Show when={message()}>
        <text
          fg={props.request.value() ? theme.warning : theme.error}
          wrapMode="word"
        >
          {props.request.value() ? `Refresh failed: ${message()}` : message()}
        </text>
      </Show>
      <Show
        when={props.request.value() !== undefined}
        fallback={
          <Show when={!message()}>
            <text fg={theme.textMuted}>{props.loading ?? "Loading…"}</text>
          </Show>
        }
      >
        {props.children(live)}
      </Show>
    </>
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
  /**
   * Show at most this many rows, scrolled to keep `selected` in view (with a
   * "n more" line), so long lists stay navigable in a short terminal.
   */
  maxRows?: number;
}) {
  const theme = useTheme();
  const start = () => {
    const max = props.maxRows;
    if (!max || props.rows.length <= max) return 0;
    const half = Math.floor(max / 2);
    return Math.max(
      0,
      Math.min((props.selected ?? 0) - half, props.rows.length - max),
    );
  };
  const visible = () =>
    props.maxRows
      ? props.rows.slice(start(), start() + props.maxRows)
      : props.rows;
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
        <For each={visible()}>
          {(row, local) => {
            const index = () => start() + local();
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
        <Show when={props.maxRows && props.rows.length > props.maxRows}>
          <text fg={theme.textSubtle} paddingLeft={1}>
            {start() + 1}-
            {Math.min(props.rows.length, start() + (props.maxRows ?? 0))} of{" "}
            {props.rows.length}
          </text>
        </Show>
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
