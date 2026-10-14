import { InvalidArgumentError } from "commander";
import type { Service } from "../api/types";

// Bounds from the API's updateServiceSchema (apps.schema.ts). The per-cell
// replica ceiling (shared tier: 3) is enforced server-side and reported back.
export const SCALE_LIMITS = {
  replicas: { min: 1, max: 300 },
  cpu: { min: 100, max: 2000 },
  memory: { min: 128, max: 6144 },
  targetPercent: { min: 10, max: 95 },
} as const;

/** Values that reset a nullable scale field to the platform default. */
const RESET = new Set(["default", "auto", "none", "off", "null"]);

/**
 * Marks a nullable field reset to the platform default. Commander turns a
 * parser's `null` into `""`, so the sentinel survives parsing and
 * {@link scalePatch} converts it to `null` for the API.
 */
export const DEFAULT = "default" as const;
export type Nullable = number | typeof DEFAULT;

/** Parse an integer in range, or `default`/`off` → {@link DEFAULT}. */
export function nullableInteger(
  label: string,
  min: number,
  max: number,
): (value: string) => Nullable {
  return (value: string) => {
    if (RESET.has(value.toLowerCase())) return DEFAULT;
    const unit = value.toLowerCase().match(/^(\d+)(m|mi|mib|%)?$/);
    if (!unit)
      throw new InvalidArgumentError(
        `${label} must be an integer between ${min} and ${max}, or "default"`,
      );
    const parsed = Number(unit[1]);
    if (parsed < min || parsed > max)
      throw new InvalidArgumentError(
        `${label} must be between ${min} and ${max}`,
      );
    return parsed;
  };
}

export function clockTime(value: string): string {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))
    throw new InvalidArgumentError("time must be HH:MM (24h)");
  return value;
}

export function weekdays(value: string): string {
  if (!/^[1-7]{1,7}$/.test(value))
    throw new InvalidArgumentError(
      "days must be ISO weekday digits, e.g. 12345 for Monday-Friday",
    );
  return value;
}

export interface ScaleOptions {
  replicas?: number;
  cpu?: Nullable;
  memory?: Nullable;
  autoscale?: boolean;
  min?: Nullable;
  max?: Nullable;
  targetCpu?: Nullable;
  targetMemory?: Nullable;
  scaleOnCpu?: boolean;
  window?: boolean;
  windowMin?: Nullable;
  windowStart?: string;
  windowEnd?: string;
  windowDays?: string;
  windowTz?: string;
}

/** Translate CLI flags into the PATCH body; unset flags are omitted. */
export function scalePatch(opts: ScaleOptions): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const set = (key: string, value: unknown) => {
    if (value !== undefined) body[key] = value === DEFAULT ? null : value;
  };
  set("replicas", opts.replicas);
  set("cpuLimit", opts.cpu);
  set("memoryLimit", opts.memory);
  set("autoscale", opts.autoscale);
  set("minReplicas", opts.min);
  set("maxReplicas", opts.max);
  set("targetCpuPercent", opts.targetCpu);
  set("targetMemoryPercent", opts.targetMemory);
  set("scaleOnCpu", opts.scaleOnCpu);
  set("scaleWindowEnabled", opts.window);
  set("scaleWindowMin", opts.windowMin);
  set("scaleWindowStart", opts.windowStart);
  set("scaleWindowEnd", opts.windowEnd);
  set("scaleWindowDays", opts.windowDays);
  set("scaleWindowTz", opts.windowTz);
  return body;
}

/**
 * Check the merged result (current service + patch) for the cross-field rules
 * the API enforces, so obvious mistakes fail before a request is sent.
 */
export function validateScale(
  current: Partial<Service>,
  patch: Record<string, unknown>,
  maxReplicas?: number,
): string | undefined {
  const next = { ...current, ...patch } as Partial<Service>;
  if (maxReplicas !== undefined) {
    for (const key of [
      "replicas",
      "minReplicas",
      "maxReplicas",
      "scaleWindowMin",
    ] as const) {
      const value = patch[key];
      if (typeof value === "number" && value > maxReplicas)
        return `this tier allows at most ${maxReplicas} replicas (${key} = ${value})`;
    }
  }
  if (next.autoscale) {
    const min = next.minReplicas ?? next.replicas ?? 1;
    const max = next.maxReplicas ?? next.replicas ?? 1;
    if (min > max) return `autoscale min (${min}) must not exceed max (${max})`;
    const cpuTrigger = next.scaleOnCpu ?? true;
    if (!cpuTrigger && !next.targetMemoryPercent)
      return "autoscale needs at least one trigger: keep CPU scaling or set --target-memory";
  }
  if (patch.scaleWindowEnabled === true && !next.autoscale)
    return "a scale window requires autoscale (--autoscale)";
  if (next.scaleWindowEnabled) {
    const missing = (
      [
        ["scaleWindowMin", "--window-min"],
        ["scaleWindowStart", "--window-start"],
        ["scaleWindowEnd", "--window-end"],
        ["scaleWindowTz", "--window-tz"],
      ] as const
    )
      .filter(([key]) => !next[key])
      .map(([, flag]) => flag);
    if (missing.length) return `a scale window needs ${missing.join(", ")}`;
    if (next.scaleWindowStart! >= next.scaleWindowEnd!)
      return "--window-start must be before --window-end (same day)";
  }
  return undefined;
}

/** One-line summary: "2 replicas" or "autoscale 2-5 @ 70% CPU, 80% memory". */
export function describeScale(service: Partial<Service>): string {
  if (!service.autoscale)
    return `${service.replicas ?? 1} replica${(service.replicas ?? 1) === 1 ? "" : "s"}`;
  const min = service.minReplicas ?? service.replicas ?? 1;
  const max = service.maxReplicas ?? service.replicas ?? 1;
  const triggers: string[] = [];
  if (service.scaleOnCpu ?? true)
    triggers.push(`${service.targetCpuPercent ?? 70}% CPU`);
  if (service.targetMemoryPercent)
    triggers.push(`${service.targetMemoryPercent}% memory`);
  return `autoscale ${min}-${max} @ ${triggers.join(", ") || "no trigger"}`;
}

export function describeLimits(service: Partial<Service>): string {
  const cpu = service.cpuLimit ? `${service.cpuLimit}m` : "default";
  const memory = service.memoryLimit ? `${service.memoryLimit}Mi` : "default";
  return `${cpu} CPU · ${memory} memory per replica`;
}

export function describeWindow(service: Partial<Service>): string | undefined {
  if (!service.scaleWindowEnabled) return undefined;
  return `min ${service.scaleWindowMin} from ${service.scaleWindowStart} to ${service.scaleWindowEnd} ${service.scaleWindowTz} (days ${service.scaleWindowDays ?? "12345"})`;
}

/** Rows of `field: before → after` for the fields a patch changed. */
export function scaleDiff(
  before: Partial<Service>,
  after: Partial<Service>,
): { field: string; before: string; after: string }[] {
  const fields: [string, (s: Partial<Service>) => string][] = [
    ["scale", describeScale],
    ["limits", describeLimits],
    ["window", (s) => describeWindow(s) ?? "off"],
  ];
  return fields
    .map(([field, show]) => ({
      field,
      before: show(before),
      after: show(after),
    }))
    .filter((row) => row.before !== row.after);
}
