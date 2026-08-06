import { test } from "node:test";
import assert from "node:assert/strict";
import {
  contextName,
  portNumber,
  repositoryUrl,
  positiveInteger,
  positiveNumber,
} from "./validate";

test("contextName accepts safe names and rejects ambiguous input", () => {
  for (const value of ["personal", "work-prod", "account_2", "org.example"])
    assert.equal(contextName(value), value);
  for (const value of [
    "",
    " two",
    "two accounts",
    "../context",
    "a".repeat(65),
  ])
    assert.throws(() => contextName(value));
});

test("positiveInteger validates and bounds integers", () => {
  assert.equal(positiveInteger("3", "nodes", 9), 3);
  for (const value of ["0", "10", "1.5", "abc", "-1"])
    assert.throws(() => positiveInteger(value, "nodes", 9));
});

test("portNumber accepts an ephemeral port and validates the TCP range", () => {
  assert.equal(portNumber("0"), 0);
  assert.equal(portNumber("5432"), 5432);
  for (const value of ["-1", "1.5", "65536", "abc"])
    assert.throws(() => portNumber(value));
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
