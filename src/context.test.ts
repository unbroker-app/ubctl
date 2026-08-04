import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveContext } from "./context";
import { saveConfig } from "./config/store";
import { DEFAULT_API_URL, ENV } from "./constants";

let tmp: string;
const saved = {
  xdg: process.env.XDG_CONFIG_HOME,
  apiUrl: process.env[ENV.apiUrl],
  token: process.env[ENV.token],
  org: process.env[ENV.org],
};

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "ubctl-ctx-"));
  process.env.XDG_CONFIG_HOME = tmp;
  delete process.env[ENV.apiUrl];
  delete process.env[ENV.token];
  delete process.env[ENV.org];
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
  restore("XDG_CONFIG_HOME", saved.xdg);
  restore(ENV.apiUrl, saved.apiUrl);
  restore(ENV.token, saved.token);
  restore(ENV.org, saved.org);
});

function restore(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

test("falls back to the default API URL with no config", () => {
  const ctx = resolveContext({});
  assert.equal(ctx.apiUrl, DEFAULT_API_URL);
  assert.equal(ctx.token, undefined);
  assert.equal(ctx.org, undefined);
  assert.equal(ctx.json, false);
});

test("config file supplies values", () => {
  saveConfig({ apiUrl: "https://file.api", token: "ub_live_file", org: "f" });
  const ctx = resolveContext({});
  assert.equal(ctx.apiUrl, "https://file.api");
  assert.equal(ctx.token, "ub_live_file");
  assert.equal(ctx.org, "f");
});

test("env overrides the config file", () => {
  saveConfig({ apiUrl: "https://file.api", token: "ub_live_file", org: "f" });
  process.env[ENV.apiUrl] = "https://env.api";
  process.env[ENV.token] = "ub_live_env";
  process.env[ENV.org] = "e";
  const ctx = resolveContext({});
  assert.equal(ctx.apiUrl, "https://env.api");
  assert.equal(ctx.token, "ub_live_env");
  assert.equal(ctx.org, "e");
});

test("flags override env and file", () => {
  saveConfig({ apiUrl: "https://file.api", org: "f" });
  process.env[ENV.apiUrl] = "https://env.api";
  process.env[ENV.org] = "e";
  const ctx = resolveContext({
    apiUrl: "https://flag.api",
    org: "flag",
    json: true,
  });
  assert.equal(ctx.apiUrl, "https://flag.api");
  assert.equal(ctx.org, "flag");
  assert.equal(ctx.json, true);
});

test("a trailing slash on the API URL is normalised away", () => {
  const ctx = resolveContext({ apiUrl: "https://x.api/" });
  assert.equal(ctx.apiUrl, "https://x.api");
});

// Guards the built-in default itself, not the precedence logic above: the
// previous default (`dev.api.cloud.unbroker.app`) shipped for months while being
// NXDOMAIN, because a Vercel DNS zone-wide wildcard answered for it. A URL is a
// contract with anyone who runs the CLI without configuring anything, so assert
// the shape rather than trust review to notice. Offline on purpose — a network
// probe here would make the suite flaky and CI-hostile.
test("the built-in default API URL is https on the unbroker.cloud domain", () => {
  const url = new URL(DEFAULT_API_URL);
  assert.equal(url.protocol, "https:");
  assert.ok(
    url.hostname === "unbroker.cloud" ||
      url.hostname.endsWith(".unbroker.cloud"),
    `DEFAULT_API_URL must be on unbroker.cloud (the platform domain), got ${url.hostname}. ` +
      "unbroker.app is mail-only and has no web records.",
  );
});
