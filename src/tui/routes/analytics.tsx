import { useTerminalDimensions } from "@opentui/solid";
import { createSignal, For, Match, Show, Switch } from "solid-js";
import type {
  TrafficBreakdown,
  TrafficDimension,
  TrafficOverview,
  TrafficRange,
} from "../../api/types";
import { bar, columnChart, compact, percent } from "../../util/chart";
import { bytes, millis } from "../../util/format";
import {
  RANGE_LABELS,
  TRAFFIC_RANGES,
  stepLabel,
  trafficKpis,
  trafficQuery,
} from "../../util/traffic";
import { useApi, useRequest } from "../context/api";
import { useHints, useRouteKeys } from "../context/hints";
import { useTheme } from "../context/theme";
import { matches } from "../lib/keys";
import { useDialog } from "../ui/dialog";
import { Loaded, Panel, RouteScroll, Stat } from "../ui/panel";
import { openScopePicker, type ScopeChoice } from "../ui/pickers";

/** Breakdown panels, paired like the dashboard's tabs. */
const PANELS: { title: string; dimensions: TrafficDimension[] }[] = [
  { title: "Pages", dimensions: ["page", "path"] },
  { title: "Referrers", dimensions: ["referer", "utm_source", "utm_campaign"] },
  { title: "Countries", dimensions: ["country"] },
  { title: "Devices", dimensions: ["device", "browser", "os"] },
  { title: "Status", dimensions: ["status", "bot"] },
];

const CHART_SERIES = [
  { key: "requests", label: "Requests" },
  { key: "pageviews", label: "Page views" },
  { key: "uniques", label: "Visitors" },
  { key: "s5xx", label: "5xx errors" },
] as const;

export function Analytics(props: { initialScope?: ScopeChoice }) {
  const theme = useTheme();
  const api = useApi();
  const dialog = useDialog();
  const dimensions = useTerminalDimensions();
  const [scope, setScope] = createSignal<ScopeChoice>(
    props.initialScope ?? { scope: {}, label: "All projects" },
  );
  const [range, setRange] = createSignal<TrafficRange>("24h");
  const [series, setSeries] = createSignal(0);
  // Which dimension each breakdown panel shows (cycled with `b`).
  const [variant, setVariant] = createSignal(0);

  const overview = useRequest<TrafficOverview>(
    () => `/traffic/overview${trafficQuery(scope().scope, { range: range() })}`,
  );

  useHints([
    { key: "p", label: "scope" },
    { key: "[ ]", label: "range" },
    { key: "c", label: "chart series" },
    { key: "b", label: "breakdowns" },
  ]);
  useRouteKeys((key) => {
    const index = TRAFFIC_RANGES.indexOf(range());
    if (matches(key, "]", "right", "l"))
      setRange(TRAFFIC_RANGES[Math.min(TRAFFIC_RANGES.length - 1, index + 1)]!);
    else if (matches(key, "[", "left", "h"))
      setRange(TRAFFIC_RANGES[Math.max(0, index - 1)]!);
    else if (matches(key, "c")) setSeries((i) => (i + 1) % CHART_SERIES.length);
    else if (matches(key, "b")) setVariant((i) => i + 1);
    else if (matches(key, "p"))
      void openScopePicker(dialog, api, scope(), setScope);
  });

  const chartWidth = () => Math.max(20, dimensions().width - 30);

  return (
    <box flexDirection="column" gap={1} flexGrow={1}>
      <box flexDirection="row" gap={2} paddingLeft={1}>
        <text>
          <span style={{ fg: theme.text }}>
            <b>Analytics</b>
          </span>
          <span style={{ fg: theme.textMuted }}> · {scope().label} · </span>
        </text>
        <For each={TRAFFIC_RANGES}>
          {(r) => (
            <text
              fg={r === range() ? theme.primaryText : theme.textMuted}
              bg={r === range() ? theme.primary : undefined}
              onMouseUp={() => setRange(r)}
            >
              {` ${r === "90d" ? "3m" : r === "365d" ? "12m" : r} `}
            </text>
          )}
        </For>
      </box>
      <RouteScroll>
        <Loaded resource={overview.data} loading="Loading traffic…">
          {(data) => {
            const k = () => trafficKpis(data);
            const chosen = () => CHART_SERIES[series()]!;
            const values = () => data.buckets.map((b) => b[chosen().key]);
            return (
              <box flexDirection="column" gap={1}>
                <Panel>
                  <box flexDirection="row" columnGap={3} flexWrap="wrap">
                    <Stat
                      label="Visitors"
                      value={
                        k().visitors === null ? "n/a" : compact(k().visitors)
                      }
                    />
                    <Stat label="Page views" value={compact(k().pageviews)} />
                    <Stat label="Requests" value={compact(k().requests)} />
                    <Stat
                      label="Online now"
                      value={k().online === null ? "n/a" : String(k().online)}
                    />
                    <Stat
                      label="Errors"
                      value={percent(k().errorRate5xx)}
                      detail={`${percent(k().errorRate4xx)} 4xx`}
                    />
                    <Stat label="p95 latency" value={millis(k().p95)} />
                    <Stat label="Bandwidth" value={bytes(k().bandwidth)} />
                  </box>
                </Panel>
                <Panel
                  title={`${chosen().label} · ${RANGE_LABELS[data.range]}`}
                  hint={`${stepLabel(data.step)} buckets · c to switch`}
                >
                  <Show
                    when={data.totals.requests > 0}
                    fallback={
                      <text fg={theme.textMuted}>
                        No traffic recorded in this window.
                      </text>
                    }
                  >
                    <box flexDirection="row" gap={1}>
                      <box width={6} flexShrink={0}>
                        <text fg={theme.textSubtle}>
                          {compact(Math.max(...values()))}
                        </text>
                        <box flexGrow={1} />
                        <text fg={theme.textSubtle}>0</text>
                      </box>
                      <box>
                        <For each={columnChart(values(), chartWidth(), 7)}>
                          {(row) => (
                            <text
                              fg={
                                chosen().key === "s5xx"
                                  ? theme.error
                                  : theme.primary
                              }
                              wrapMode="none"
                            >
                              {row}
                            </text>
                          )}
                        </For>
                      </box>
                    </box>
                  </Show>
                </Panel>
                <Show when={data.visitorsUnavailable}>
                  <text fg={theme.warning} paddingLeft={1}>
                    Visitor counts are unavailable: this cell's ingress does not
                    see client IPs.
                  </text>
                </Show>
                <box flexDirection="row" gap={1} flexWrap="wrap">
                  <HostsPanel hosts={data.hosts} />
                  <For each={PANELS}>
                    {(panel) => (
                      <BreakdownPanel
                        title={panel.title}
                        dimension={
                          panel.dimensions[variant() % panel.dimensions.length]!
                        }
                        query={trafficQuery(scope().scope, {
                          range: range(),
                          limit: 8,
                        })}
                      />
                    )}
                  </For>
                </box>
                <Show when={k().scanners > 0}>
                  <text fg={theme.textSubtle} paddingLeft={1}>
                    {compact(k().scanners)} scanner probes excluded ·{" "}
                    {compact(k().bots)} bot requests
                  </text>
                </Show>
              </box>
            );
          }}
        </Loaded>
      </RouteScroll>
    </box>
  );
}

/**
 * Breakdown panels tile in 2 or 3 columns. The main pane is the terminal
 * minus the sidebar (20), its gap and the shell padding; narrow terminals
 * without a sidebar get the full width.
 */
function usePanelWidth() {
  const dimensions = useTerminalDimensions();
  return () => {
    const width = dimensions().width;
    const main = width < 90 ? width - 2 : width - 24;
    const columns = main >= 141 ? 3 : main >= 72 ? 2 : 1;
    return Math.max(30, Math.floor((main - (columns - 1)) / columns));
  };
}

function HostsPanel(props: { hosts: TrafficOverview["hosts"] }) {
  const theme = useTheme();
  const panelWidth = usePanelWidth();
  const max = () => Math.max(1, ...props.hosts.map((h) => h.requests));
  return (
    <Panel title="Hostnames" width={panelWidth()}>
      <For each={props.hosts.slice(0, 8)}>
        {(h) => (
          <Row
            label={h.host}
            value={compact(h.requests)}
            fill={bar(h.requests, max(), 10)}
            color={theme.accent}
          />
        )}
      </For>
      <Show when={props.hosts.length === 0}>
        <text fg={theme.textMuted}>No hostnames yet.</text>
      </Show>
    </Panel>
  );
}

function BreakdownPanel(props: {
  title: string;
  dimension: TrafficDimension;
  query: string;
}) {
  const theme = useTheme();
  const panelWidth = usePanelWidth();
  const breakdown = useRequest<TrafficBreakdown>(
    () => `/traffic/breakdown/${props.dimension}${props.query}`,
  );
  return (
    <Panel title={`${props.title} · ${props.dimension}`} width={panelWidth()}>
      <Switch>
        <Match
          when={
            (breakdown.data.error as { status?: number } | undefined)
              ?.status === 402
          }
        >
          <text fg={theme.warning} wrapMode="word">
            Breakdowns need the Pro plan.
          </text>
        </Match>
        <Match when={true}>
          <Loaded resource={breakdown.data}>
            {(data) => (
              <box>
                <For each={data.rows.slice(0, 8)}>
                  {(row) => (
                    <Row
                      label={row.value || "(none)"}
                      value={percent(row.share)}
                      fill={bar(row.share, data.rows[0]?.share || 1, 10)}
                      color={theme.primary}
                    />
                  )}
                </For>
                <Show when={data.rows.length === 0}>
                  <text fg={theme.textMuted}>No data in this window.</text>
                </Show>
              </box>
            )}
          </Loaded>
        </Match>
      </Switch>
    </Panel>
  );
}

function Row(props: {
  label: string;
  value: string;
  fill: string;
  color: unknown;
}) {
  const theme = useTheme();
  // The label takes whatever the panel leaves after the bar and the value.
  return (
    <box flexDirection="row" gap={1}>
      <text fg={theme.text} flexGrow={1} flexShrink={1} wrapMode="none">
        {props.label}
      </text>
      <text fg={props.color as never} width={10} flexShrink={0} wrapMode="none">
        {props.fill}
      </text>
      <text fg={theme.textMuted} width={6} flexShrink={0} wrapMode="none">
        {props.value}
      </text>
    </box>
  );
}
