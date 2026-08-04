import { CliError } from "./errors";

/** Parse `30s`, `15m`, `2h`, `7d`, an ISO timestamp, or epoch milliseconds. */
export function sinceEpoch(value: string, now = Date.now()): number {
  const relative = value.trim().match(/^(\d+(?:\.\d+)?)(s|m|h|d)$/i);
  if (relative) {
    const factor = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[
      relative[2]!.toLowerCase() as "s" | "m" | "h" | "d"
    ];
    return Math.floor(now - Number(relative[1]) * factor);
  }
  if (/^\d{12,}$/.test(value)) return Number(value);
  const parsed = Date.parse(value);
  if (Number.isFinite(parsed)) return parsed;
  throw new CliError(
    "since must be a duration such as 30m, an ISO timestamp, or epoch milliseconds",
  );
}
