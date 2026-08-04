/** Human-friendly "2m ago" / "3d ago" from an epoch-ms timestamp. */
export function age(epochMs: number | null | undefined): string {
  if (!epochMs) return "-";
  const secs = Math.max(0, Math.floor((Date.now() - epochMs) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

/** Elapsed time between two epoch-ms stamps, e.g. "42s". null end → "-". */
export function duration(
  start: number,
  end: number | null | undefined,
): string {
  if (!end) return "-";
  const secs = Math.max(0, Math.round((end - start) / 1000));
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  return `${mins}m${secs % 60}s`;
}
