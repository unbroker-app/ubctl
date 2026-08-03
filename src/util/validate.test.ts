import { test } from "node:test";
import assert from "node:assert/strict";
import { repositoryUrl, positiveInteger, positiveNumber } from "./validate";

test("positiveInteger validates and bounds integers", () => {
  assert.equal(positiveInteger("3", "nodes", 9), 3);
  for (const value of ["0", "10", "1.5", "abc", "-1"])
    assert.throws(() => positiveInteger(value, "nodes", 9));
});

test("positiveNumber accepts plain decimals and rejects alternate syntax", () => {
  assert.equal(positiveNumber("1.5", "price"), 1.5);
  for (const value of ["0", "-1", "abc", "Infinity", "0x10", "1e3", " 1 "])
    assert.throws(() => positiveNumber(value, "price"));
});

test("repositoryUrl accepts and normalizes supported HTTPS owner/repo URLs", () => {
  assert.equal(
    repositoryUrl("https://github.com/unbroker-app/ubctl.git"),
    "https://github.com/unbroker-app/ubctl",
  );
  assert.equal(
    repositoryUrl("https://gitlab.com/acme/app"),
    "https://gitlab.com/acme/app",
  );
  assert.equal(
    repositoryUrl("https://bitbucket.org/acme/app"),
    "https://bitbucket.org/acme/app",
  );
  for (const value of [
    "not-a-url",
    "http://github.com/a/b",
    "https://example.com/a/b",
    "https://github.com/a",
    "https://github.com/a/b/issues",
    "https://user:pass@github.com/a/b",
    "https://github.com/a/b?token=secret",
    "https://github.com/a/b#fragment",
  ])
    assert.throws(() => repositoryUrl(value));
});
