// Dependency-free text charts shared by the formatted CLI output and the TUI.

const SPARK = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

/**
 * Render values as a one-line sparkline. When `width` is smaller than the
 * series, adjacent points are averaged into buckets so the shape survives.
 */
export function sparkline(values: readonly number[], width?: number): string {
  const series = width ? resample(values, width) : [...values];
  if (series.length === 0) return "";
  const max = Math.max(...series);
  const min = Math.min(0, ...series);
  const span = max - min;
  return series
    .map((v) => {
      if (span === 0) return v > 0 ? SPARK[3] : SPARK[0];
      const index = Math.round(((v - min) / span) * (SPARK.length - 1));
      return SPARK[Math.max(0, Math.min(SPARK.length - 1, index))];
    })
    .join("");
}

/** Average a series down (or leave it as is) to at most `width` points. */
export function resample(values: readonly number[], width: number): number[] {
  if (width <= 0) return [];
  if (values.length <= width) return [...values];
  const out: number[] = [];
  const step = values.length / width;
  for (let i = 0; i < width; i++) {
    const from = Math.floor(i * step);
    const to = Math.max(from + 1, Math.floor((i + 1) * step));
    const bucket = values.slice(from, to);
    out.push(bucket.reduce((sum, v) => sum + v, 0) / bucket.length);
  }
  return out;
}

/** A horizontal bar `value / max` of `width` cells, using eighth blocks. */
export function bar(value: number, max: number, width: number): string {
  if (width <= 0 || max <= 0 || value <= 0) return "";
  const cells = Math.min(width, (value / max) * width);
  const full = Math.floor(cells);
  const partial = Math.round((cells - full) * 8);
  const eighths = ["", "▏", "▎", "▍", "▌", "▋", "▊", "▉"];
  return (
    "█".repeat(full) + (partial > 0 && full < width ? eighths[partial] : "")
  );
}

/** A `[████░░░░] 42%` gauge for utilization against a limit. */
export function gauge(used: number, limit: number, width = 20): string {
  if (!limit || limit <= 0) return "-";
  const ratio = Math.max(0, used / limit);
  const filled = Math.min(width, Math.round(ratio * width));
  return `${"█".repeat(filled)}${"░".repeat(width - filled)} ${Math.round(ratio * 100)}%`;
}

/** Compact number: 950, 1.2k, 3.4M. */
export function compact(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "-";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${trim(n / 1e9)}B`;
  if (abs >= 1e6) return `${trim(n / 1e6)}M`;
  if (abs >= 1e3) return `${trim(n / 1e3)}k`;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function trim(n: number): string {
  return n >= 100 ? n.toFixed(0) : n.toFixed(1).replace(/\.0$/, "");
}

/** Format a ratio (0-1) or percentage (0-100) as `12.3%`. */
export function percent(
  value: number | null | undefined,
  ratio = true,
): string {
  if (value === null || value === undefined || !Number.isFinite(value))
    return "-";
  const pct = ratio ? value * 100 : value;
  return `${pct >= 10 ? pct.toFixed(0) : pct.toFixed(1)}%`;
}

/**
 * A vertical column chart `height` rows tall, one column per value after
 * resampling to `width`. Returns rows top to bottom; partial cells use
 * eighth blocks so small differences stay visible.
 */
export function columnChart(
  values: readonly number[],
  width: number,
  height: number,
): string[] {
  const series = resample(values, width);
  const max = Math.max(0, ...series);
  const eighths = [" ", "▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
  const rows: string[] = [];
  for (let row = height - 1; row >= 0; row--) {
    let line = "";
    for (const value of series) {
      const level = max > 0 ? (value / max) * height : 0;
      const fill = Math.max(0, Math.min(1, level - row));
      // Keep a visible baseline for any non-zero value.
      const index =
        row === 0 && value > 0 && fill < 1 / 8 ? 1 : Math.round(fill * 8);
      line += eighths[index];
    }
    rows.push(line);
  }
  return rows;
}
