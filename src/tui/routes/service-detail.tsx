import { TextAttributes } from "@opentui/core";
import { useTerminalDimensions } from "@opentui/solid";
import {
  createResource,
  createSignal,
  For,
  Match,
  Show,
  Switch,
  type Accessor,
} from "solid-js";
import {
  seriesValues,
  serviceResources,
  usageTotals,
  type ServiceResources,
} from "../../api/resources";
import type {
  DeploymentsResponse,
  LogsResponse,
  Service,
} from "../../api/types";
import { gauge, sparkline } from "../../util/chart";
import { age, bytes, duration } from "../../util/format";
import {
  describeLimits,
  describeScale,
  describeWindow,
} from "../../util/scale";
import { useApi, useRequest } from "../context/api";
import { useHints, useRouteKeys } from "../context/hints";
import { useRoute, type ServiceTab } from "../context/route";
import { statusColor, useTheme } from "../context/theme";
import { matches } from "../lib/keys";
import { useDialog } from "../ui/dialog";
import { DialogConfirm } from "../ui/dialog-confirm";
import { Fields, Loaded, Panel, RouteScroll, Table } from "../ui/panel";
import { ScaleEditor } from "../ui/scale-editor";
import { useToast } from "../ui/toast";

const TABS: { key: ServiceTab; title: string }[] = [
  { key: "overview", title: "Overview" },
  { key: "resources", title: "Resources" },
  { key: "deployments", title: "Deployments" },
  { key: "logs", title: "Logs" },
];

export function ServiceDetail(props: { serviceId: string; tab?: ServiceTab }) {
  const theme = useTheme();
  const api = useApi();
  const route = useRoute();
  const dialog = useDialog();
  const toast = useToast();
  const [tab, setTab] = createSignal<ServiceTab>(props.tab ?? "overview");
  const [range, setRange] = createSignal<"1h" | "6h" | "24h" | "7d">("1h");

  const [resources] = createResource(
    () => ({ id: props.serviceId, range: range(), tick: api.tick }),
    ({ id, range }) => serviceResources(api.client, id, range),
  );
  const service = () => resources.latest?.service;

  useHints([
    { key: "←→", label: "tabs" },
    { key: "s", label: "scale" },
    { key: "d", label: "deploy" },
    { key: "x", label: "start/stop" },
    { key: "a", label: "analytics" },
    { key: "esc", label: "back" },
  ]);

  function cycleTab(step: number) {
    const index = TABS.findIndex((t) => t.key === tab());
    setTab(TABS[(index + step + TABS.length) % TABS.length]!.key);
  }

  async function act(label: string, run: () => Promise<unknown>) {
    try {
      await run();
      toast.show({ variant: "success", message: label });
      api.refresh();
    } catch (err) {
      toast.error(err);
    }
  }

  useRouteKeys((key) => {
    const s = service();
    if (matches(key, "left", "h")) cycleTab(-1);
    else if (matches(key, "right", "l")) cycleTab(1);
    else if (matches(key, "t") && tab() === "resources")
      setRange((r) =>
        r === "1h" ? "6h" : r === "6h" ? "24h" : r === "24h" ? "7d" : "1h",
      );
    else if (!s) return;
    else if (matches(key, "s"))
      dialog.replace(() => <ScaleEditor service={s} />);
    else if (matches(key, "a"))
      route.navigate({
        name: "analytics",
        scope: { scope: { serviceId: s.id }, label: s.name },
      });
    else if (matches(key, "d"))
      dialog.replace(() => (
        <DialogConfirm
          title={`Deploy ${s.name}?`}
          message={`Builds ${s.branch ?? "the configured source"} and rolls it out${s.needsRedeploy ? ", applying pending scale/config changes" : ""}.`}
          confirmLabel="Deploy"
          onConfirm={() =>
            act(`Deployment queued for ${s.name}`, () =>
              api.client.post(`/apps/services/${s.id}/deployments`, {}),
            )
          }
        />
      ));
    else if (matches(key, "x")) {
      const stopping = s.status !== "stopped";
      dialog.replace(() => (
        <DialogConfirm
          title={`${stopping ? "Stop" : "Start"} ${s.name}?`}
          message={
            stopping
              ? "Scales the service to zero. Its URL stops answering until you start it again."
              : "Brings the service back at its configured scale."
          }
          confirmLabel={stopping ? "Stop" : "Start"}
          danger={stopping}
          onConfirm={() =>
            act(`${stopping ? "Stopped" : "Started"} ${s.name}`, () =>
              api.client.post(
                `/apps/services/${s.id}/${stopping ? "disable" : "enable"}`,
              ),
            )
          }
        />
      ));
    }
  });

  return (
    <box flexDirection="column" gap={1} flexGrow={1}>
      <box flexDirection="row" gap={2} paddingLeft={1}>
        <Show
          when={service()}
          fallback={<text fg={theme.textMuted}>Loading service…</text>}
        >
          {(s: Accessor<Service>) => (
            <text wrapMode="none">
              <span style={{ fg: statusColor(theme, s().status) }}>● </span>
              <span style={{ fg: theme.text }}>
                <b>{s().name}</b>
              </span>
              <span style={{ fg: theme.textMuted }}>
                {" "}
                {s().status}
                {s().needsRedeploy ? " · changes pending deploy" : ""} ·{" "}
                {s().url}
              </span>
            </text>
          )}
        </Show>
      </box>
      <box flexDirection="row" gap={1} paddingLeft={1}>
        <For each={TABS}>
          {(t) => (
            <box
              paddingLeft={1}
              paddingRight={1}
              backgroundColor={
                tab() === t.key ? theme.primary : theme.backgroundElement
              }
              onMouseUp={() => setTab(t.key)}
            >
              <text
                fg={tab() === t.key ? theme.primaryText : theme.textMuted}
                attributes={tab() === t.key ? TextAttributes.BOLD : 0}
              >
                {t.title}
              </text>
            </box>
          )}
        </For>
      </box>
      <Show when={resources.error}>
        <text fg={theme.error}>
          {String((resources.error as Error)?.message)}
        </text>
      </Show>
      <Show when={resources.latest}>
        {(data: Accessor<ServiceResources>) => (
          <RouteScroll>
            <Switch>
              <Match when={tab() === "overview"}>
                <OverviewTab service={data().service} />
              </Match>
              <Match when={tab() === "resources"}>
                <ResourcesTab data={data()} range={range()} />
              </Match>
              <Match when={tab() === "deployments"}>
                <DeploymentsTab serviceId={props.serviceId} />
              </Match>
              <Match when={tab() === "logs"}>
                <LogsTab serviceId={props.serviceId} />
              </Match>
            </Switch>
          </RouteScroll>
        )}
      </Show>
    </box>
  );
}

function OverviewTab(props: { service: Service }) {
  const s = () => props.service;
  return (
    <Panel title="Service">
      <Fields
        rows={[
          { label: "id", value: s().id },
          {
            label: "source",
            value: s().repoUrl
              ? `${s().repoUrl} @ ${s().branch}`
              : (s().imageRef ?? "-"),
          },
          { label: "framework", value: s().framework ?? "-" },
          { label: "url", value: s().url },
          { label: "domains", value: s().domains.join(", ") || "-" },
          { label: "access", value: s().accessMode ?? "public" },
          { label: "auto deploy", value: s().autoDeploy ? "on push" : "off" },
          { label: "scale", value: describeScale(s()) },
          { label: "limits", value: describeLimits(s()) },
          ...(s().volumePath
            ? [
                {
                  label: "volume",
                  value: `${s().volumePath} (${s().volumeSizeGb} GiB)`,
                },
              ]
            : []),
          { label: "created", value: age(s().createdAt) },
        ]}
      />
    </Panel>
  );
}

function ResourcesTab(props: { data: ServiceResources; range: string }) {
  const theme = useTheme();
  const dimensions = useTerminalDimensions();
  const chartWidth = () => Math.max(20, Math.min(80, dimensions().width - 60));
  const live = () => props.data.live;
  const metrics = () => {
    const l = live();
    return l.state === "ok" ? l.metrics : null;
  };
  const totals = () => usageTotals(metrics());
  const window = () => describeWindow(props.data.service);

  const history: [string, string, (v: number) => string][] = [
    ["CPU", "cpu_millicores", (v) => `${Math.round(v)}m`],
    ["Memory", "memory_mib", (v) => `${Math.round(v)}Mi`],
    ["Net in", "rx_bytes_per_sec", (v) => `${bytes(v)}/s`],
    ["Net out", "tx_bytes_per_sec", (v) => `${bytes(v)}/s`],
    ["Replicas", "ready_replicas", (v) => v.toFixed(0)],
  ];

  return (
    <box flexDirection="column" gap={1}>
      <box flexDirection="row" gap={1}>
        <Panel title="Configured" flexGrow={1} hint="s to scale">
          <Fields
            rows={[
              { label: "scale", value: describeScale(props.data.service) },
              { label: "limits", value: describeLimits(props.data.service) },
              { label: "window", value: window() ?? "off" },
              {
                label: "pending",
                value: props.data.service.needsRedeploy
                  ? "yes — press d to deploy"
                  : "no",
              },
            ]}
          />
        </Panel>
        <Panel title="Live" flexGrow={1}>
          <Switch>
            <Match when={live().state !== "ok"}>
              <text fg={theme.warning} wrapMode="word">
                {live().state === "gated"
                  ? "Live usage requires the Pro plan."
                  : `Live usage unavailable: ${(live() as { message: string }).message}`}
              </text>
            </Match>
            <Match when={!metrics()}>
              <text fg={theme.textMuted}>Not running — no live usage.</text>
            </Match>
            <Match when={metrics()}>
              <Fields
                rows={[
                  {
                    label: "replicas",
                    value: `${metrics()!.replicas.ready}/${metrics()!.replicas.desired} ready`,
                  },
                  {
                    label: "cpu",
                    value: gauge(totals().cpu ?? 0, totals().cpuLimit ?? 0, 18),
                  },
                  {
                    label: "memory",
                    value: gauge(
                      totals().memory ?? 0,
                      totals().memoryLimit ?? 0,
                      18,
                    ),
                  },
                ]}
              />
            </Match>
          </Switch>
        </Panel>
      </box>
      <Show when={metrics()?.pods.length}>
        <Panel title="Pods">
          <Table
            rows={metrics()!.pods}
            columns={[
              { header: "pod", grow: true, value: (p) => p.pod },
              {
                header: "state",
                width: 18,
                value: (p) => p.state,
                color: (p) => statusColor(theme, p.state),
              },
              {
                header: "cpu",
                width: 14,
                value: (p) =>
                  p.cpuMillicores === null
                    ? "-"
                    : `${p.cpuMillicores}m / ${metrics()!.limits.cpuMillicores}m`,
              },
              {
                header: "memory",
                width: 16,
                value: (p) =>
                  p.memoryMiB === null
                    ? "-"
                    : `${p.memoryMiB}Mi / ${metrics()!.limits.memoryMiB}Mi`,
              },
              {
                header: "restarts",
                width: 8,
                value: (p) => String(p.restarts),
              },
            ]}
          />
        </Panel>
      </Show>
      <Show when={props.data.series}>
        <Panel title={`History · ${props.range}`} hint="t to change range">
          <For each={history}>
            {([label, name, fmt]) => {
              const values = () => seriesValues(props.data.series, name);
              return (
                <Show when={values().length}>
                  <box flexDirection="row" gap={2}>
                    <text fg={theme.textMuted} width={9}>
                      {label}
                    </text>
                    <text fg={theme.primary} wrapMode="none">
                      {sparkline(values(), chartWidth())}
                    </text>
                    <text fg={theme.textMuted} wrapMode="none">
                      avg{" "}
                      {fmt(
                        values().reduce((a, b) => a + b, 0) / values().length,
                      )}{" "}
                      · peak {fmt(Math.max(...values()))}
                    </text>
                  </box>
                </Show>
              );
            }}
          </For>
        </Panel>
      </Show>
    </box>
  );
}

function DeploymentsTab(props: { serviceId: string }) {
  const theme = useTheme();
  const deployments = useRequest<DeploymentsResponse>(
    () => `/apps/services/${props.serviceId}/deployments`,
  );
  return (
    <Panel title="Deployments" flexGrow={1}>
      <Loaded resource={deployments.data}>
        {(data) => (
          <Table
            rows={data.deployments.slice(0, 20)}
            empty="No deployments yet — press d to deploy."
            columns={[
              { header: "id", width: 14, value: (d) => d.id },
              {
                header: "status",
                width: 11,
                value: (d) => d.status,
                color: (d) => statusColor(theme, d.status),
              },
              { header: "trigger", width: 10, value: (d) => d.trigger },
              {
                header: "commit",
                width: 8,
                value: (d) => d.commitSha?.slice(0, 7) ?? "-",
              },
              { header: "created", width: 9, value: (d) => age(d.createdAt) },
              {
                header: "took",
                width: 8,
                value: (d) => duration(d.createdAt, d.finishedAt),
              },
            ]}
          />
        )}
      </Loaded>
    </Panel>
  );
}

function LogsTab(props: { serviceId: string }) {
  const theme = useTheme();
  const logs = useRequest<LogsResponse>(
    () => `/apps/services/${props.serviceId}/logs`,
  );
  return (
    <Panel title="Runtime logs" flexGrow={1} hint="refreshes every 15s · r now">
      <Loaded resource={logs.data}>
        {(data) => (
          <scrollbox flexGrow={1} stickyScroll stickyStart="bottom" height={20}>
            <For each={data.logs.slice(-400)}>
              {(line) => (
                <text fg={theme.text} wrapMode="none">
                  {line}
                </text>
              )}
            </For>
            <Show when={data.logs.length === 0}>
              <text fg={theme.textMuted}>No log lines yet.</text>
            </Show>
          </scrollbox>
        )}
      </Loaded>
    </Panel>
  );
}
