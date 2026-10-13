/** The subset of an OpenTUI key event the keymap needs. */
export interface KeyLike {
  name: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  option?: boolean;
}

/**
 * Normalize a key event into a binding string such as `ctrl+p`, `shift+tab`
 * or `q`, so handlers compare against the same spelling the footer shows.
 */
export function keyName(key: KeyLike): string {
  const parts: string[] = [];
  if (key.ctrl) parts.push("ctrl");
  if (key.meta || key.option) parts.push("alt");
  if (key.shift && key.name.length > 1) parts.push("shift");
  parts.push(key.name === "enter" ? "return" : key.name);
  return parts.join("+");
}

/** True when a key matches any of the given bindings. */
export function matches(key: KeyLike, ...bindings: string[]): boolean {
  const name = keyName(key);
  return bindings.includes(name);
}
