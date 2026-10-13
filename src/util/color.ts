/**
 * Minimal ANSI styling for formatted output. Colors only reach an interactive
 * terminal: piped output, `NO_COLOR` and `TERM=dumb` get plain text, so
 * scripts that scrape tables (they should use --json) still see the same bytes.
 */
export function colorEnabled(): boolean {
  if (process.env.NO_COLOR !== undefined) return false;
  const force = process.env.FORCE_COLOR;
  if (force !== undefined && force !== "") return !/^(0|false)$/i.test(force);
  return Boolean(process.stdout.isTTY) && process.env.TERM !== "dumb";
}

const wrap =
  (open: string, close = "\x1b[39m") =>
  (text: string): string =>
    colorEnabled() ? `${open}${text}${close}` : text;

export const color = {
  // Unbroker lime (#c4fa00) in truecolor terminals, bright green elsewhere.
  primary: wrap(
    process.env.COLORTERM === "truecolor" || process.env.COLORTERM === "24bit"
      ? "\x1b[38;2;196;250;0m"
      : "\x1b[92m",
  ),
  success: wrap("\x1b[32m"),
  warning: wrap("\x1b[33m"),
  error: wrap("\x1b[31m"),
  muted: wrap("\x1b[90m"),
  bold: wrap("\x1b[1m", "\x1b[22m"),
};

/** Color a status word by meaning (running, failed, building, …). */
export function statusText(status: string): string {
  const value = status.toLowerCase();
  // Failures first: "unhealthy" and "inactive" contain "healthy"/"active".
  if (/(fail|error|crash|unhealthy|degraded|cancel|inactive)/.test(value))
    return color.error(status);
  if (/(running|ready|active|live|healthy|succeeded|online|paid)/.test(value))
    return color.success(status);
  if (
    /(build|deploy|pending|queued|starting|provision|creating|progress|due)/.test(
      value,
    )
  )
    return color.warning(status);
  return status;
}

/** Visible width of a string, ignoring ANSI escape sequences. */
export function visibleLength(text: string): number {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, "").length;
}
