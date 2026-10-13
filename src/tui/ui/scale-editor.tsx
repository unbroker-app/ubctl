import { TextAttributes } from "@opentui/core";
import { useKeyboard } from "@opentui/solid";
import { createMemo, createSignal, For, onMount, Show } from "solid-js";
import type {
  OrganizationResponse,
  Service,
  ServiceResponse,
} from "../../api/types";
import {
  SCALE_LIMITS,
  describeLimits,
  describeScale,
  validateScale,
} from "../../util/scale";
import { useApi } from "../context/api";
import { useTheme } from "../context/theme";
import { matches } from "../lib/keys";
import { useDialog } from "./dialog";
import { useToast } from "./toast";

type ScaleKey =
  | "replicas"
  | "cpuLimit"
  | "memoryLimit"
  | "autoscale"
  | "minReplicas"
  | "maxReplicas"
  | "targetCpuPercent"
  | "targetMemoryPercent"
  | "scaleOnCpu";

interface Field {
  key: ScaleKey;
  label: string;
  kind: "int" | "nullable" | "bool";
  min?: number;
  max?: number;
  unit?: string;
  /** What `default`/empty means for nullable fields. */
  fallback?: string;
  autoscaleOnly?: boolean;
}

const { replicas, cpu, memory, targetPercent } = SCALE_LIMITS;

const FIELDS: Field[] = [
  { key: "replicas", label: "Replicas", kind: "int", ...replicas },
  {
    key: "cpuLimit",
    label: "CPU per replica",
    kind: "nullable",
    ...cpu,
    unit: "m",
    fallback: "platform default",
  },
  {
    key: "memoryLimit",
    label: "Memory per replica",
    kind: "nullable",
    ...memory,
    unit: "Mi",
    fallback: "platform default",
  },
  { key: "autoscale", label: "Autoscale", kind: "bool" },
  {
    key: "minReplicas",
    label: "Min replicas",
    kind: "nullable",
    ...replicas,
    fallback: "= replicas",
    autoscaleOnly: true,
  },
  {
    key: "maxReplicas",
    label: "Max replicas",
    kind: "nullable",
    ...replicas,
    fallback: "= replicas",
    autoscaleOnly: true,
  },
  {
    key: "scaleOnCpu",
    label: "Scale on CPU",
    kind: "bool",
    autoscaleOnly: true,
  },
  {
    key: "targetCpuPercent",
    label: "CPU target",
    kind: "nullable",
    ...targetPercent,
    unit: "%",
    fallback: "70%",
    autoscaleOnly: true,
  },
  {
    key: "targetMemoryPercent",
    label: "Memory target",
    kind: "nullable",
    ...targetPercent,
    unit: "%",
    fallback: "off",
    autoscaleOnly: true,
  },
];

function display(field: Field, value: unknown): string {
  if (field.kind === "bool")
    return value === false
      ? "off"
      : value
        ? "on"
        : field.key === "scaleOnCpu"
          ? "on"
          : "off";
  if (value === null || value === undefined) return field.fallback ?? "-";
  return `${value}${field.unit ?? ""}`;
}

/**
 * Edit a service's scale in place: ↑/↓ choose a field, enter edits or
 * toggles, `a` saves (applies on the next deploy), `D` saves and deploys.
 * Validation mirrors the API so most mistakes never leave the terminal.
 */
export function ScaleEditor(props: {
  service: Service;
  /** Called with the saved service before the editor closes. */
  onSaved?: (service: Service, deploy: boolean) => void;
  /**
   * When set, "save & deploy" hands the deployment to the caller instead of
   * queueing it here (the CLI follows it live after the editor closes).
   */
  deferDeploy?: boolean;
}) {
  const theme = useTheme();
  const api = useApi();
  const dialog = useDialog();
  const toast = useToast();
  const [draft, setDraft] = createSignal<Partial<Service>>({});
  const [selected, setSelected] = createSignal(0);
  const [editing, setEditing] = createSignal(false);
  const [input, setInput] = createSignal("");
  const [error, setError] = createSignal<string>();
  const [busy, setBusy] = createSignal(false);
  const [ceiling, setCeiling] = createSignal<number>();

  onMount(async () => {
    try {
      const { organization } = await api.client.get<OrganizationResponse>(
        `/organizations/${api.orgId}`,
      );
      setCeiling(organization.cell?.maxReplicas);
    } catch {
      // The API still enforces the ceiling on save.
    }
  });

  const merged = createMemo(() => ({ ...props.service, ...draft() }));
  const fields = createMemo(() =>
    FIELDS.filter((f) => !f.autoscaleOnly || merged().autoscale),
  );
  const field = () => fields()[selected()];
  const changed = createMemo(() => Object.keys(draft()).length > 0);

  dialog.onEscape(() => {
    if (!editing()) return false;
    setEditing(false);
    setError(undefined);
    return true;
  });

  function set(key: ScaleKey, value: unknown) {
    const next = { ...draft() } as Record<string, unknown>;
    if (props.service[key] === value) delete next[key];
    else next[key] = value;
    setDraft(next as Partial<Service>);
    setError(undefined);
  }

  function activate() {
    const f = field();
    if (!f) return;
    if (f.kind === "bool") {
      const current = merged()[f.key];
      const on = f.key === "scaleOnCpu" ? current !== false : Boolean(current);
      return set(f.key, !on);
    }
    const value = merged()[f.key];
    setInput(value === null || value === undefined ? "" : String(value));
    setEditing(true);
  }

  function commit() {
    const f = field()!;
    const raw = input().trim().toLowerCase();
    if (
      f.kind === "nullable" &&
      (raw === "" || raw === "default" || raw === "off")
    ) {
      set(f.key, null);
      return setEditing(false);
    }
    const n = Number(raw.replace(/(m|mi|%)$/, ""));
    if (!Number.isInteger(n) || n < f.min! || n > f.max!)
      return setError(
        `${f.label} must be an integer between ${f.min} and ${f.max}${f.kind === "nullable" ? ", or empty for default" : ""}`,
      );
    set(f.key, n);
    setEditing(false);
  }

  async function save(deploy: boolean) {
    if (busy()) return;
    if (!changed() && !deploy) return setError("Nothing changed yet.");
    const patch = draft() as Record<string, unknown>;
    const problem = validateScale(props.service, patch, ceiling());
    if (problem) return setError(problem);
    setBusy(true);
    dialog.setBusy(true);
    try {
      let service = props.service;
      if (changed())
        service = (
          await api.client.patch<ServiceResponse>(
            `/apps/services/${props.service.id}`,
            patch,
          )
        ).service;
      if (deploy && !props.deferDeploy)
        await api.client.post(`/apps/services/${service.id}/deployments`, {});
      props.onSaved?.(service, deploy);
      dialog.clear();
      toast.show({
        variant: "success",
        title: `Scaled ${service.name}`,
        message: deploy
          ? `${describeScale(service)} — deploying now.`
          : `${describeScale(service)} — applies on the next deploy (press d).`,
      });
      api.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      dialog.setBusy(false);
    }
  }

  useKeyboard((key) => {
    if (editing()) {
      if (matches(key, "return")) {
        key.preventDefault();
        commit();
      }
      return;
    }
    if (matches(key, "up", "k")) setSelected((i) => Math.max(0, i - 1));
    else if (matches(key, "down", "j"))
      setSelected((i) => Math.min(fields().length - 1, i + 1));
    else if (matches(key, "return", "space")) {
      key.preventDefault();
      activate();
    } else if (matches(key, "a")) void save(false);
    else if (key.name === "d" && key.shift) void save(true);
  });

  return (
    <box paddingLeft={4} paddingRight={4} paddingBottom={1} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={theme.text}>
          Scale {props.service.name}
        </text>
        <text fg={theme.textMuted}>esc</text>
      </box>
      <text fg={theme.textMuted} wrapMode="word">
        Now: {describeScale(props.service)} · {describeLimits(props.service)}
        <Show when={ceiling()}> · tier max {ceiling()} replicas</Show>
      </text>
      <box>
        <For each={fields()}>
          {(f, index) => {
            const active = () => index() === selected();
            const dirty = () => f.key in draft();
            return (
              <box
                flexDirection="row"
                paddingLeft={1}
                backgroundColor={
                  active() ? theme.backgroundSelected : undefined
                }
                onMouseUp={() => {
                  if (busy()) return;
                  // Clicking another row abandons an unfinished edit; its
                  // text must never be committed into the clicked field.
                  if (editing()) {
                    if (index() === selected()) return;
                    setEditing(false);
                    setError(undefined);
                  }
                  setSelected(index());
                  activate();
                }}
              >
                <text fg={active() ? theme.text : theme.textMuted} width={22}>
                  {f.label}
                </text>
                <Show
                  when={active() && editing()}
                  fallback={
                    <text
                      fg={dirty() ? theme.primary : theme.text}
                      attributes={dirty() ? TextAttributes.BOLD : 0}
                    >
                      {display(f, merged()[f.key])}
                      {dirty()
                        ? `  (was ${display(f, props.service[f.key])})`
                        : ""}
                    </text>
                  }
                >
                  <input
                    focused
                    width={20}
                    value={input()}
                    placeholder={f.kind === "nullable" ? "empty = default" : ""}
                    placeholderColor={theme.textSubtle}
                    textColor={theme.text}
                    focusedTextColor={theme.text}
                    focusedBackgroundColor={theme.backgroundElement}
                    cursorColor={theme.primary}
                    onInput={(v: string) => setInput(v)}
                  />
                </Show>
              </box>
            );
          }}
        </For>
      </box>
      <Show
        when={error()}
        fallback={
          <text fg={theme.textSubtle} wrapMode="word">
            {busy()
              ? "Saving…"
              : editing()
                ? "enter set · esc cancel"
                : "↑↓ move · enter edit · a save · shift+d save & deploy · esc close"}
          </text>
        }
      >
        <text fg={theme.error} wrapMode="word">
          {error()}
        </text>
      </Show>
    </box>
  );
}
