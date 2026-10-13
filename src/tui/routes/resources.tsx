import { createResource, createSignal, Show } from "solid-js";
import { fleetResources, usageTotals } from "../../api/resources";
import type { UsageResponse } from "../../api/types";
import { gauge } from "../../util/chart";
import { describeLimits, describeScale } from "../../util/scale";
import { useApi, useRequest } from "../context/api";
import { useHints, useRouteKeys } from "../context/hints";
import { useRoute } from "../context/route";
import { statusColor, useTheme } from "../context/theme";
import { matches } from "../lib/keys";
import { useDialog } from "../ui/dialog";
import { Fields, Loaded, Panel, Table, RouteScroll } from "../ui/panel";
import { ScaleEditor } from "../ui/scale-editor";

export function Resources() {
  const theme = useTheme();
  const api = useApi();
  const route = useRoute();
  const dialog = useDialog();
  const [selected, setSelected] = createSignal(0);
  const [fleet] = createResource(
    () => ({ tick: api.tick }),
    () => fleetResources(api.client),
  );
  const usage = useRequest<UsageResponse>(() => "/account/usage");
  const rows = () => fleet.latest ?? [];
  const current = () => rows()[selected()];

  useHints([
    { key: "↑↓", label: "select" },
    { key: "enter", label: "details" },
    { key: "s", label: "scale" },
  ]);
  useRouteKeys((key) => {
    if (matches(key, "up", "k")) setSelected((i) => Math.max(0, i - 1));
    else if (matches(key, "down", "j"))
      setSelected((i) => Math.min(rows().length - 1, i + 1));
    else if (matches(key, "return") && current())
      route.navigate({
        name: "service",
        serviceId: current()!.service.id,
        tab: "resources",
      });
    else if (matches(key, "s") && current())
      dialog.replace(() => <ScaleEditor service={current()!.service} />);
  });

  const gated = () => rows().find((r) => r.live.state === "gated");

  return (
    <RouteScroll>
      <Panel title="Account usage">
        <Loaded resource={usage.data}>
          {(data) => (
            <Fields
              rows={[
                {
                  label: "compute",
                  value: `${data.usage.vcpus} vCPU · ${data.usage.memoryGb} GB memory · ${data.usage.storageGb} GB storage`,
                },
                {
                  label: "servers",
                  value: `${data.usage.droplets} of ${data.usage.dropletLimit}`,
                },
                {
                  label: "this month",
                  value: `$${data.usage.monthToDate.toFixed(2)} so far · $${data.usage.projected.toFixed(2)} projected`,
                },
              ]}
            />
          )}
        </Loaded>
      </Panel>
      <Panel
        title="Services"
        flexGrow={1}
        hint={current() ? describeLimits(current()!.service) : undefined}
      >
        <Show when={fleet.error}>
          <text fg={theme.error}>
            {String((fleet.error as Error)?.message)}
          </text>
        </Show>
        <Show
          when={fleet.latest}
          fallback={<text fg={theme.textMuted}>Sampling every service…</text>}
        >
          <Table
            rows={rows()}
            selected={selected()}
            onSelect={setSelected}
            empty="No services yet."
            columns={[
              {
                header: "",
                width: 1,
                value: () => "●",
                color: (r) => statusColor(theme, r.service.status),
              },
              { header: "service", width: 22, value: (r) => r.service.name },
              {
                header: "ready",
                width: 6,
                value: (r) =>
                  r.live.state === "ok" && r.live.metrics
                    ? `${r.live.metrics.replicas.ready}/${r.live.metrics.replicas.desired}`
                    : "-",
              },
              {
                header: "scale",
                width: 24,
                value: (r) => describeScale(r.service),
              },
              {
                header: "cpu",
                width: 18,
                value: (r) => {
                  const t = usageTotals(
                    r.live.state === "ok" ? r.live.metrics : null,
                  );
                  return t.cpu === null
                    ? "-"
                    : gauge(t.cpu, t.cpuLimit ?? 0, 10);
                },
              },
              {
                header: "memory",
                width: 18,
                value: (r) => {
                  const t = usageTotals(
                    r.live.state === "ok" ? r.live.metrics : null,
                  );
                  return t.memory === null
                    ? "-"
                    : gauge(t.memory, t.memoryLimit ?? 0, 10);
                },
              },
            ]}
          />
          <Show when={gated()}>
            <text fg={theme.warning} paddingTop={1}>
              Live usage requires the Pro plan — showing configured scale only.
            </text>
          </Show>
        </Show>
      </Panel>
    </RouteScroll>
  );
}
