import { test } from "node:test";
import assert from "node:assert/strict";
import { age, duration } from "./format";

test("age renders relative time, '-' for empty", () => {
  assert.equal(age(null), "-");
  assert.equal(age(undefined), "-");
  assert.equal(age(Date.now()), "0s ago");
  assert.equal(age(Date.now() - 65_000), "1m ago");
  assert.equal(age(Date.now() - 3 * 3600_000), "3h ago");
  assert.equal(age(Date.now() - 2 * 86400_000), "2d ago");
});

test("duration formats elapsed time between two stamps", () => {
  assert.equal(duration(0, null), "-");
  assert.equal(duration(1000, 43_000), "42s");
  assert.equal(duration(0, 125_000), "2m5s");
});
