import { createSignal, Show, type Accessor } from "solid-js";
import type {
  DatabaseCluster,
  DatabaseMetricsResponse,
  DatabasesResponse,
  DropletsResponse,
} from "../../api/cloud-types";
import { useRequest } from "../context/api";
import { useHints, useRouteKeys } from "../context/hints";
import { statusColor, useTheme } from "../context/theme";
import { matches } from "../lib/keys";
import { Fields, Loaded, Panel, Table, RouteScroll } from "../ui/panel";

/** Managed databases and servers. */
export function Cloud() {
  const theme = useTheme();
  const databases = useRequest<DatabasesResponse>(() => "/databases");
  const servers = useRequest<DropletsResponse>(() => "/droplets");
  const [selected, setSelected] = createSignal(0);
  const current = () => databases.data.latest?.databases[selected()];
  const metrics = useRequest<DatabaseMetricsResponse>(() =>
    current() ? `/databases/${current()!.id}/metrics` : undefined,
  );

  useHints([{ key: "↑↓", label: "select database" }]);
  useRouteKeys((key) => {
    const count = databases.data.latest?.databases.length ?? 0;
    if (matches(key, "up", "k")) setSelected((i) => Math.max(0, i - 1));
    else if (matches(key, "down", "j"))
      setSelected((i) => Math.min(count - 1, i + 1));
  });

  return (
    <RouteScroll>
      <box flexDirection="row" gap={1}>
        <Panel title="Managed databases" flexGrow={1}>
          <Loaded resource={databases.data}>
            {(data) => (
              <Table
                rows={data.databases}
                selected={selected()}
                onSelect={setSelected}
                empty="No managed databases."
                columns={[
                  {
                    header: "",
                    width: 1,
                    value: () => "●",
                    color: (d) => statusColor(theme, d.status),
                  },
                  { header: "name", width: 20, value: (d) => d.name },
                  {
                    header: "engine",
                    width: 12,
                    value: (d) => `${d.engine} ${d.version}`,
                  },
                  {
                    header: "nodes",
                    width: 22,
                    value: (d) => `${d.nodes} × ${d.size}`,
                  },
                  { header: "region", width: 8, value: (d) => d.region },
                ]}
              />
            )}
          </Loaded>
        </Panel>
        <Show when={current()}>
          {(db: Accessor<DatabaseCluster>) => (
            <Panel title={db().name} width={36}>
              <Fields
                rows={[
                  { label: "status", value: db().status },
                  { label: "storage", value: `${db().storageGb} GB` },
                  {
                    label: "cpu",
                    value:
                      metrics.data.latest?.metrics.cpuPct !== undefined
                        ? `${metrics.data.latest.metrics.cpuPct}%`
                        : "-",
                  },
                  {
                    label: "memory",
                    value:
                      metrics.data.latest?.metrics.memPct !== undefined
                        ? `${metrics.data.latest.metrics.memPct}%`
                        : "-",
                  },
                  {
                    label: "load",
                    value:
                      metrics.data.latest?.metrics.load1 !== undefined
                        ? `${metrics.data.latest.metrics.load1} / ${metrics.data.latest.metrics.load5} / ${metrics.data.latest.metrics.load15}`
                        : "-",
                  },
                ]}
              />
              <text fg={theme.textSubtle} paddingTop={1} wrapMode="word">
                Resize: ubctl db resize {db().id} --size … --nodes …
              </text>
            </Panel>
          )}
        </Show>
      </box>
      <Panel title="Servers" flexGrow={1}>
        <Loaded resource={servers.data}>
          {(data) => (
            <Table
              rows={data.droplets}
              empty="No servers."
              columns={[
                {
                  header: "",
                  width: 1,
                  value: () => "●",
                  color: (d) => statusColor(theme, d.status),
                },
                { header: "name", width: 20, value: (d) => d.name },
                {
                  header: "size",
                  width: 28,
                  value: (d) =>
                    `${d.vcpus} vCPU · ${d.memoryGb} GB · ${d.diskGb} GB`,
                },
                { header: "region", width: 10, value: (d) => d.region },
                { header: "ipv4", grow: true, value: (d) => d.ipv4 || "-" },
              ]}
            />
          )}
        </Loaded>
      </Panel>
    </RouteScroll>
  );
}
