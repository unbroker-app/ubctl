import { test } from "node:test";
import assert from "node:assert/strict";
import { printTable } from "./output";

/** Capture everything written to stdout while `fn` runs. */
function capture(fn: () => void): string {
  const orig = process.stdout.write.bind(process.stdout);
  let out = "";
  process.stdout.write = ((chunk: string | Uint8Array): boolean => {
    out += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
    return true;
  }) as typeof process.stdout.write;
  try {
    fn();
  } finally {
    process.stdout.write = orig;
  }
  return out;
}

test("printTable renders an uppercase header and rows", () => {
  const out = capture(() =>
    printTable(
      [{ id: "p1", name: "demo" }],
      [
        { key: "id", header: "id" },
        { key: "name", header: "name" },
      ],
    ),
  );
  const lines = out.trimEnd().split("\n");
  assert.equal(lines[0], "ID  NAME");
  assert.equal(lines[1], "p1  demo");
});

test("printTable prints (none) for an empty list", () => {
  const out = capture(() => printTable([], [{ key: "id", header: "id" }]));
  assert.equal(out.trim(), "(none)");
});

test("missing values render as '-'", () => {
  const out = capture(() =>
    printTable(
      [{ a: "x", b: "" }],
      [
        { key: "a", header: "a" },
        { key: "b", header: "b" },
      ],
    ),
  );
  assert.match(out, /x +-/);
});
