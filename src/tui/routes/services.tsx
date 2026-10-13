import { useTerminalDimensions } from "@opentui/solid";
import { createMemo, createSignal } from "solid-js";
import type { ProjectsResponse, ServicesResponse } from "../../api/types";
import { age } from "../../util/format";
import { describeScale } from "../../util/scale";
import { useApi, useRequest } from "../context/api";
import { useHints, useRouteKeys } from "../context/hints";
import { useRoute } from "../context/route";
import { statusColor, useTheme } from "../context/theme";
import { matches } from "../lib/keys";
import { useDialog } from "../ui/dialog";
import { Loaded, Panel, Table } from "../ui/panel";
import { openServicePicker } from "../ui/pickers";
import { ScaleEditor } from "../ui/scale-editor";
import { useToast } from "../ui/toast";

export function Services() {
  const theme = useTheme();
  const api = useApi();
  const route = useRoute();
  const dialog = useDialog();
  const dimensions = useTerminalDimensions();
  const toast = useToast();
  const services = useRequest<ServicesResponse>(() => "/apps/services");
  const projects = useRequest<ProjectsResponse>(() => "/apps/projects");
  const [selected, setSelected] = createSignal(0);

  const projectName = createMemo(
    () =>
      new Map((projects.value()?.projects ?? []).map((p) => [p.id, p.name])),
  );
  // Group by project so the list reads like the dashboard's project boards.
  const rows = createMemo(() =>
    [...(services.value()?.services ?? [])].sort(
      (a, b) =>
        (projectName().get(a.projectId) ?? "").localeCompare(
          projectName().get(b.projectId) ?? "",
        ) || a.name.localeCompare(b.name),
    ),
  );
  const current = () => rows()[selected()];

  useHints([
    { key: "↑↓", label: "select" },
    { key: "enter", label: "open" },
    { key: "s", label: "scale" },
    { key: "/", label: "find" },
  ]);
  useRouteKeys((key) => {
    const count = rows().length;
    if (matches(key, "up", "k")) setSelected((i) => Math.max(0, i - 1));
    else if (matches(key, "down", "j"))
      setSelected((i) => Math.min(count - 1, i + 1));
    else if (matches(key, "return") && current())
      route.navigate({ name: "service", serviceId: current()!.id });
    else if (matches(key, "s") && current()) {
      // Freeze the target: the list can re-sort or shrink while it's open.
      const target = current()!;
      dialog.replace(() => <ScaleEditor service={target} />);
    } else if (matches(key, "/")) {
      key.preventDefault();
      void openServicePicker(dialog, api, route).catch(toast.error);
    }
  });

  return (
    <Panel title="Services" flexGrow={1} hint={`${rows().length} services`}>
      <Loaded request={services}>
        {() => (
          <Table
            rows={rows()}
            selected={selected()}
            maxRows={Math.max(5, dimensions().height - 12)}
            onSelect={(i) => {
              if (i === selected())
                route.navigate({ name: "service", serviceId: rows()[i]!.id });
              setSelected(i);
            }}
            empty="No services yet."
            columns={[
              {
                header: "",
                width: 1,
                value: () => "●",
                color: (s) => statusColor(theme, s.status),
              },
              { header: "name", width: 20, value: (s) => s.name },
              {
                header: "project",
                width: 12,
                value: (s) => projectName().get(s.projectId) ?? "-",
              },
              {
                header: "status",
                width: 9,
                value: (s) => s.status + (s.needsRedeploy ? "*" : ""),
                color: (s) => statusColor(theme, s.status),
              },
              { header: "scale", width: 24, value: (s) => describeScale(s) },
              {
                header: "url",
                grow: true,
                value: (s) => s.url ?? "-",
              },
              { header: "created", width: 8, value: (s) => age(s.createdAt) },
            ]}
          />
        )}
      </Loaded>
    </Panel>
  );
}
