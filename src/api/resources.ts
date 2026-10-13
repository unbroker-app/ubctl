import { ApiError, type ApiClient } from "./client";
import type {
  MetricRange,
  Metrics,
  MetricSeriesResult,
  MetricsResponse,
  Service,
  ServiceResponse,
  ServicesResponse,
} from "./types";

/**
 * Data loading for the "Resources" views, shared by `ubctl apps resources`,
 * `ubctl apps services resources` and the TUI. Live usage needs the Pro plan:
 * a 402 is reported as `gated` instead of failing the whole view, because the
 * configured scale and limits are still useful on their own.
 */

export type LiveMetrics =
  | { state: "ok"; metrics: Metrics | null }
  | { state: "gated"; message: string }
  | { state: "error"; message: string };

export interface ServiceResources {
  service: Service;
  live: LiveMetrics;
  series?: MetricSeriesResult;
}

export async function liveMetrics(
  client: ApiClient,
  serviceId: string,
): Promise<LiveMetrics> {
  try {
    const { metrics } = await client.get<MetricsResponse>(
      `/apps/services/${serviceId}/metrics`,
    );
    return { state: "ok", metrics };
  } catch (err) {
    if (err instanceof ApiError && err.status === 402)
      return { state: "gated", message: err.message };
    return {
      state: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function serviceResources(
  client: ApiClient,
  serviceId: string,
  range?: MetricRange,
): Promise<ServiceResources> {
  const [{ service }, live, series] = await Promise.all([
    client.get<ServiceResponse>(`/apps/services/${serviceId}`),
    liveMetrics(client, serviceId),
    range
      ? client
          .get<MetricSeriesResult>(
            `/apps/services/${serviceId}/metrics/series?range=${range}`,
          )
          // History is optional: a plan gate, an outage or an API without
          // the route must not hide the scale and live usage already loaded.
          .catch(() => undefined)
      : Promise.resolve(undefined),
  ]);
  return { service, live, series };
}

export interface FleetRow {
  service: Service;
  live: LiveMetrics;
}

/** Every service (optionally one project's) with its live usage. */
export async function fleetResources(
  client: ApiClient,
  projectId?: string,
  concurrency = 4,
): Promise<FleetRow[]> {
  const { services } = await client.get<ServicesResponse>("/apps/services");
  const scoped = projectId
    ? services.filter((s) => s.projectId === projectId)
    : services;
  const rows: FleetRow[] = new Array(scoped.length);
  let next = 0;
  let gated: LiveMetrics | undefined;
  async function worker() {
    while (next < scoped.length) {
      const index = next++;
      const service = scoped[index]!;
      // A stopped service has nothing to sample, and once the plan gate has
      // answered there's no point asking again for every other service.
      const live: LiveMetrics =
        gated ??
        (service.status === "stopped"
          ? { state: "ok", metrics: null }
          : await liveMetrics(client, service.id));
      if (live.state === "gated") gated = live;
      rows[index] = { service, live };
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, scoped.length) }, worker),
  );
  return rows;
}

/** Sum CPU/memory across pods; null when no pod has reported a sample. */
export function usageTotals(metrics: Metrics | null): {
  cpu: number | null;
  memory: number | null;
  cpuLimit: number | null;
  memoryLimit: number | null;
} {
  if (!metrics || metrics.pods.length === 0)
    return { cpu: null, memory: null, cpuLimit: null, memoryLimit: null };
  const sum = (pick: (p: Metrics["pods"][number]) => number | null) => {
    const values = metrics.pods
      .map(pick)
      .filter((v): v is number => v !== null);
    return values.length ? values.reduce((a, b) => a + b, 0) : null;
  };
  return {
    cpu: sum((p) => p.cpuMillicores),
    memory: sum((p) => p.memoryMiB),
    cpuLimit: metrics.limits.cpuMillicores * metrics.pods.length,
    memoryLimit: metrics.limits.memoryMiB * metrics.pods.length,
  };
}

/**
 * Peak values for a history row: the per-bucket maxima the API computes
 * (`cpu_peak_millicores`, `memory_peak_mib`) when present, since a max over
 * bucket averages hides short spikes.
 */
export function seriesPeak(
  result: MetricSeriesResult | undefined,
  name: string,
): number | undefined {
  const peakName: Record<string, string> = {
    cpu_millicores: "cpu_peak_millicores",
    memory_mib: "memory_peak_mib",
  };
  const peaks = seriesValues(result, peakName[name] ?? "");
  const values = peaks.length ? peaks : seriesValues(result, name);
  return values.length ? Math.max(...values) : undefined;
}

/** Pick one series by name from a series result. */
export function seriesValues(
  result: MetricSeriesResult | undefined,
  name: string,
): number[] {
  return (
    result?.series.find((s) => s.name === name)?.points.map(([, v]) => v) ?? []
  );
}
