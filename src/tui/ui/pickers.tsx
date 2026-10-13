import type { ProjectsResponse, ServicesResponse } from "../../api/types";
import type { useApi } from "../context/api";
import type { useRoute } from "../context/route";
import type { TrafficScope } from "../../util/traffic";
import type { DialogContext } from "./dialog";
import { DialogSelect } from "./dialog-select";

type Api = ReturnType<typeof useApi>;
type RouteCtx = ReturnType<typeof useRoute>;

/** Fuzzy "go to service" picker, grouped by project. */
export async function openServicePicker(
  dialog: DialogContext,
  api: Api,
  route: RouteCtx,
): Promise<void> {
  const [{ services }, { projects }] = await Promise.all([
    api.client.get<ServicesResponse>("/apps/services"),
    api.client.get<ProjectsResponse>("/apps/projects"),
  ]);
  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  dialog.replace(() => (
    <DialogSelect
      title="Open service"
      placeholder="Search services"
      options={services.map((s) => ({
        title: s.name,
        description: s.id,
        footer: s.status,
        category: projectName.get(s.projectId) ?? "Other",
        value: s.id,
      }))}
      onSelect={(o) => route.navigate({ name: "service", serviceId: o.value })}
    />
  ));
}

export interface ScopeChoice {
  scope: TrafficScope;
  label: string;
}

/** Analytics scope picker: organization, environment, project or service. */
export async function openScopePicker(
  dialog: DialogContext,
  api: Api,
  current: ScopeChoice,
  onPick: (choice: ScopeChoice) => void,
): Promise<void> {
  const [{ services }, { projects }] = await Promise.all([
    api.client.get<ServicesResponse>("/apps/services"),
    api.client.get<ProjectsResponse>("/apps/projects"),
  ]);
  const options: { title: string; category: string; value: ScopeChoice }[] = [
    {
      title: "All projects",
      category: "Organization",
      value: { scope: {}, label: "All projects" },
    },
    {
      title: "Production",
      category: "Organization",
      value: { scope: { environment: "production" }, label: "Production" },
    },
    {
      title: "Preview",
      category: "Organization",
      value: { scope: { environment: "preview" }, label: "Preview" },
    },
    ...projects.map((p) => ({
      title: p.name,
      category: "Projects",
      value: { scope: { projectId: p.id }, label: p.name },
    })),
    ...services.map((s) => ({
      title: s.name,
      category: "Services",
      value: { scope: { serviceId: s.id }, label: s.name },
    })),
  ];
  dialog.replace(() => (
    <DialogSelect
      title="Analytics scope"
      placeholder="Search projects and services"
      options={options}
      current={options.find((o) => o.value.label === current.label)?.value}
      onSelect={(o) => onPick(o.value)}
    />
  ));
}
