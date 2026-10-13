import { InvalidArgumentError } from "commander";
import type {
  TrafficDimension,
  TrafficOverview,
  TrafficRange,
} from "../api/types";

export const TRAFFIC_RANGES: TrafficRange[] = [
  "24h",
  "7d",
  "30d",
  "90d",
  "365d",
];

/** Dashboard spellings accepted for the API's range keys. */
const RANGE_ALIASES: Record<string, TrafficRange> = {
  "1d": "24h",
  "24h": "24h",
  "7d": "7d",
  "1w": "7d",
  "30d": "30d",
  "1m": "30d",
  "90d": "90d",
  "3m": "90d",
  "365d": "365d",
  "12m": "365d",
  "1y": "365d",
};

export const RANGE_LABELS: Record<TrafficRange, string> = {
  "24h": "last 24 hours",
  "7d": "last 7 days",
  "30d": "last 30 days",
  "90d": "last 3 months",
  "365d": "last 12 months",
};

export const TRAFFIC_DIMENSIONS: TrafficDimension[] = [
  "page",
  "path",
  "referer",
  "country",
  "device",
  "browser",
  "os",
  "status",
  "method",
  "bot",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "protocol",
  "scheme",
  "tls",
  "cache",
];

/** Friendly names for breakdowns, matching the dashboard's tab labels. */
const DIMENSION_ALIASES: Record<string, TrafficDimension> = {
  pages: "page",
  paths: "path",
  referrer: "referer",
  referrers: "referer",
  countries: "country",
  devices: "device",
  browsers: "browser",
  bots: "bot",
  "utm-source": "utm_source",
  "utm-medium": "utm_medium",
  "utm-campaign": "utm_campaign",
};

export function trafficRange(value: string): TrafficRange {
  const range = RANGE_ALIASES[value.toLowerCase()];
  if (!range)
    throw new InvalidArgumentError(
      `range must be one of ${TRAFFIC_RANGES.join(", ")} (aliases: 3m, 12m)`,
    );
  return range;
}

export function trafficDimension(value: string): TrafficDimension {
  const key = value.toLowerCase();
  const dimension =
    DIMENSION_ALIASES[key] ??
    TRAFFIC_DIMENSIONS.find((d) => d === key.replace(/-/g, "_"));
  if (!dimension)
    throw new InvalidArgumentError(
      `dimension must be one of ${TRAFFIC_DIMENSIONS.join(", ")}`,
    );
  return dimension;
}

export interface TrafficScope {
  serviceId?: string;
  projectId?: string;
  environment?: "production" | "preview";
}

/**
 * Build the query string for `/traffic/*`. The API resolves scope as
 * service > project > environment > organization, so only the narrowest
 * scope is sent to keep requests (and `--trace`) unambiguous.
 */
export function trafficQuery(
  scope: TrafficScope,
  params: { range?: TrafficRange; host?: string; limit?: number },
): string {
  const qs = new URLSearchParams();
  if (params.range) qs.set("range", params.range);
  if (scope.serviceId) qs.set("serviceId", scope.serviceId);
  else if (scope.projectId) qs.set("projectId", scope.projectId);
  else if (scope.environment) qs.set("environment", scope.environment);
  if (params.host) qs.set("host", params.host);
  if (params.limit) qs.set("limit", String(params.limit));
  const text = qs.toString();
  return text ? `?${text}` : "";
}

export function describeScope(scope: TrafficScope): string {
  if (scope.serviceId) return `service ${scope.serviceId}`;
  if (scope.projectId) return `project ${scope.projectId}`;
  if (scope.environment) return `${scope.environment} environments`;
  return "all projects";
}

/** Derived KPIs shared by `ubctl analytics` and the TUI. */
export function trafficKpis(overview: TrafficOverview) {
  const t = overview.totals;
  const served = t.requests;
  return {
    visitors: overview.visitorsUnavailable ? null : t.uniques,
    pageviews: t.pageviews,
    requests: t.requests,
    online: overview.visitorsUnavailable ? null : overview.online,
    errorRate5xx: served > 0 ? t.s5xx / served : 0,
    errorRate4xx: served > 0 ? t.s4xx / served : 0,
    p95: t.p95,
    bandwidth: t.bytesOut,
    bots: t.bots,
    scanners: t.probes,
  };
}

/** Bucket width as words, e.g. "15 min" or "1 day". */
export function stepLabel(stepMs: number): string {
  const minutes = Math.round(stepMs / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? "1 day" : `${days} days`;
}
