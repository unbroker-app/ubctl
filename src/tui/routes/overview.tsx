import { createMemo, For, Show, type Accessor } from "solid-js";
import type {
  ActivityResponse,
  ProjectsResponse,
  ServicesResponse,
  TrafficOverview,
} from "../../api/types";
import { compact, percent, sparkline } from "../../util/chart";
import { millis } from "../../util/format";
import { trafficKpis } from "../../util/traffic";
import { useRequest } from "../context/api";
import { useHints, useRouteKeys } from "../context/hints";
import { useRoute } from "../context/route";
import { statusColor, useTheme } from "../context/theme";
import { matches } from "../lib/keys";
import { Loaded, Panel, Stat, RouteScroll } from "../ui/panel";

export function Overview() {
  const theme = useTheme();
  const route = useRoute();
  const services = useRequest<ServicesResponse>(() => "/apps/services");
  const projects = useRequest<ProjectsResponse>(() => "/apps/projects");
  const traffic = useRequest<TrafficOverview>(
    () => "/traffic/overview?range=24h",
  );
  const activity = useRequest<ActivityResponse>(() => "/account/activity");

  useHints([
    { key: "s", label: "services" },
    { key: "a", label: "analytics" },
  ]);
  useRouteKeys((key) => {
    if (matches(key, "s")) route.navigate({ name: "services" });
    if (matches(key, "a")) route.navigate({ name: "analytics" });
  });

  const counts = createMemo(() => {
    const list = services.data.latest?.services ?? [];
    const by = (status: string) =>
      list.filter((s) => s.status === status).length;
    return {
      total: list.length,
      running: by("running"),
      failed: by("failed"),
      building: by("building"),
    };
  });

  return (
    <RouteScroll>
      <Panel title="Organization">
        <box flexDirection="row" columnGap={2} flexWrap="wrap">
          <Stat
            label="Projects"
            value={String(projects.data.latest?.projects.length ?? "…")}
          />
          <Stat
            label="Services"
            value={services.data.latest ? String(counts().total) : "…"}
            detail={`${counts().running} running`}
          />
          <Stat
            label="Failing"
            value={String(counts().failed)}
            detail={
              counts().building ? `${counts().building} building` : undefined
            }
          />
          <Show when={traffic.data.latest}>
            {(t: Accessor<TrafficOverview>) => {
              const k = trafficKpis(t());
              return (
                <>
                  <Stat
                    label="Visitors 24h"
                    value={k.visitors === null ? "n/a" : compact(k.visitors)}
                    detail={sparkline(
                      t().buckets.map((b) => b.uniques),
                      16,
                    )}
                  />
                  <Stat
                    label="Requests 24h"
                    value={compact(k.requests)}
                    detail={sparkline(
                      t().buckets.map((b) => b.requests),
                      16,
                    )}
                  />
                  <Stat
                    label="5xx · p95"
                    value={`${percent(k.errorRate5xx)} · ${millis(k.p95)}`}
                  />
                </>
              );
            }}
          </Show>
        </box>
      </Panel>
      <box flexDirection="row" gap={1} flexGrow={1}>
        <Panel title="Services" flexGrow={1} hint="2 to manage">
          <Loaded resource={services.data}>
            {(data) => (
              <box>
                <For each={data.services.slice(0, 14)}>
                  {(s) => (
                    <box
                      flexDirection="row"
                      gap={1}
                      onMouseUp={() =>
                        route.navigate({ name: "service", serviceId: s.id })
                      }
                    >
                      <text fg={statusColor(theme, s.status)}>●</text>
                      <text fg={theme.text} width={24} wrapMode="none">
                        {s.name}
                      </text>
                      <text fg={theme.textMuted} wrapMode="none">
                        {s.status}
                      </text>
                    </box>
                  )}
                </For>
                <Show when={data.services.length === 0}>
                  <text fg={theme.textMuted}>
                    No services yet — create one with `ubctl apps services
                    create`.
                  </text>
                </Show>
              </box>
            )}
          </Loaded>
        </Panel>
        <Panel title="Recent activity" flexGrow={1}>
          <Loaded resource={activity.data}>
            {(data) => (
              <box>
                <For each={data.activity.slice(0, 14)}>
                  {(event) => (
                    <text wrapMode="none">
                      <span style={{ fg: theme.textSubtle }}>
                        {event.time}{" "}
                      </span>
                      <span style={{ fg: theme.text }}>{event.action} </span>
                      <span style={{ fg: theme.textMuted }}>
                        {event.target}
                      </span>
                    </text>
                  )}
                </For>
              </box>
            )}
          </Loaded>
        </Panel>
      </box>
    </RouteScroll>
  );
}
