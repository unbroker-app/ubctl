import { test } from "node:test";
import assert from "node:assert/strict";
import {
  githubRepositoryUrl,
  positiveInteger,
  positiveNumber,
} from "./validate";

test("positiveInteger validates and bounds integers", () => {
  assert.equal(positiveInteger("3", "nodes", 9), 3);
  for (const value of ["0", "10", "1.5", "abc", "-1"])
    assert.throws(() => positiveInteger(value, "nodes", 9));
});

test("positiveNumber rejects non-finite and non-positive values", () => {
  assert.equal(positiveNumber("1.5", "price"), 1.5);
  for (const value of ["0", "-1", "abc", "Infinity"])
    assert.throws(() => positiveNumber(value, "price"));
});

test("githubRepositoryUrl only accepts HTTPS owner/repo URLs", () => {
  assert.equal(
    githubRepositoryUrl("https://github.com/unbroker-app/ubctl"),
    "https://github.com/unbroker-app/ubctl",
  );
  for (const value of [
    "not-a-url",
    "http://github.com/a/b",
    "https://example.com/a/b",
    "https://github.com/a",
    "https://github.com/a/b/issues",
  ])
    assert.throws(() => githubRepositoryUrl(value));
});
