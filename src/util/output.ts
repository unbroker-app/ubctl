/** Print a value as pretty JSON (used when `--json` is set). */
export function printJson(value: unknown): void {
  process.stdout.write(JSON.stringify(value, null, 2) + "\n");
}

/** Print a plain line to stdout. */
export function print(line = ""): void {
  process.stdout.write(line + "\n");
}

export interface PanelRow {
  label: string;
  value: string;
}

/** Render a compact, dependency-free status panel for interactive milestones. */
export function printPanel(
  title: string,
  subtitle: string,
  rows: PanelRow[],
  hints: string[] = [],
): void {
  const labelWidth = Math.max(0, ...rows.map((row) => row.label.length));
  const content = [
    title,
    subtitle,
    ...rows.map((row) =>
      `${row.label.padEnd(labelWidth)}  ${row.value}`.trimEnd(),
    ),
    ...hints,
  ];
  const innerWidth = Math.max(30, ...content.map((line) => line.length)) + 2;
  const line = (value = "") => `│ ${value.padEnd(innerWidth - 2)} │`;

  print(`╭${"─".repeat(innerWidth)}╮`);
  print(line(title));
  print(line(subtitle));
  print(`├${"─".repeat(innerWidth)}┤`);
  for (const row of rows) {
    print(line(`${row.label.padEnd(labelWidth)}  ${row.value}`));
  }
  if (hints.length > 0) {
    print(`├${"─".repeat(innerWidth)}┤`);
    for (const hint of hints) print(line(hint));
  }
  print(`╰${"─".repeat(innerWidth)}╯`);
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
    parts
      .map((p, i) => p.padEnd(widths[i]!))
      .join("  ")
      .trimEnd();

  print(fmt(columns.map((c) => c.header.toUpperCase())));
  for (const row of cells) print(fmt(row));
}
