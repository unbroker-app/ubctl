/** Print a value as pretty JSON (used when `--json` is set). */
export function printJson(value: unknown): void {
  process.stdout.write(JSON.stringify(value, null, 2) + "\n");
}

/** Print a plain line to stdout. */
export function print(line = ""): void {
  process.stdout.write(line + "\n");
}

/**
 * Render an array of records as a left-aligned text table. Columns are the
 * given keys; missing/empty values render as "-". Kept dependency-free.
 */
export function printTable<T>(
  rows: T[],
  columns: { key: keyof T; header: string }[],
): void {
  if (rows.length === 0) {
    print("(none)");
    return;
  }
  const cells = rows.map((row) =>
    columns.map((c) => {
      const v = (row as Record<string, unknown>)[c.key as string];
      return v === undefined || v === null || v === "" ? "-" : String(v);
    }),
  );
  const widths = columns.map((c, i) =>
    Math.max(c.header.length, ...cells.map((r) => r[i]!.length)),
  );
  const fmt = (parts: string[]) =>
    parts.map((p, i) => p.padEnd(widths[i]!)).join("  ").trimEnd();

  print(fmt(columns.map((c) => c.header.toUpperCase())));
  for (const row of cells) print(fmt(row));
}
