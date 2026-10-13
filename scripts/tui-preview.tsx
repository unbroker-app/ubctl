#!/usr/bin/env bun
/**
 * Print a text capture of the dashboard rendered against the test fixtures,
 * for docs and quick visual checks without an API:
 *
 *   bun scripts/tui-preview.tsx [width] [height] [keys…]
 *
 * Keys are pressed in order after the first render, e.g. `3` for Analytics.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { testRender } from "@opentui/solid";
import { App } from "../src/tui/app";
import { fixtureSession } from "../src/tui/testing/fixtures";

process.env.XDG_CONFIG_HOME = mkdtempSync(join(tmpdir(), "ubctl-preview-"));
const [width = "110", height = "32", ...keys] = process.argv.slice(2);
const setup = await testRender(
  () => (
    <App session={fixtureSession()} reload={async () => fixtureSession()} />
  ),
  { width: Number(width), height: Number(height) },
);
const settle = async () => {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    await setup.renderOnce();
  }
};
await settle();
for (const key of keys) {
  if (key === "enter") setup.mockInput.pressEnter();
  else if (key === "down") setup.mockInput.pressArrow("down");
  else if (key === "right") setup.mockInput.pressArrow("right");
  else if (key === "pagedown") setup.mockInput.pressKey("\x1b[6~");
  else setup.mockInput.pressKey(key);
  await settle();
}
console.log(
  setup
    .captureCharFrame()
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n"),
);
setup.renderer.destroy();
process.exit(0);
