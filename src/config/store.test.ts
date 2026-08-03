import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  statSync,
  existsSync,
  writeFileSync,
  mkdirSync,
  chmodSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadConfig,
  saveConfig,
  clearConfigKey,
  deleteConfig,
  configPath,
  configDir,
} from "./store";

let tmp: string;
const prevXdg = process.env.XDG_CONFIG_HOME;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "ubctl-cfg-"));
  process.env.XDG_CONFIG_HOME = tmp;
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
  if (prevXdg === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = prevXdg;
});

test("configDir honours XDG_CONFIG_HOME", () => {
  assert.equal(configDir(), join(tmp, "ubctl"));
});

test("loadConfig returns {} when no file exists", () => {
  assert.deepEqual(loadConfig(), {});
});

test("saveConfig persists and merges", () => {
  saveConfig({ apiUrl: "https://api.example", token: "ub_live_x" });
  assert.deepEqual(loadConfig(), {
    apiUrl: "https://api.example",
    token: "ub_live_x",
  });
  saveConfig({ org: "acme" }); // merge, not replace
  assert.deepEqual(loadConfig(), {
    apiUrl: "https://api.example",
    token: "ub_live_x",
    org: "acme",
  });
});

test("the config file is written 0600 (owner-only)", () => {
  saveConfig({ token: "secret" });
  const mode = statSync(configPath()).mode & 0o777;
  assert.equal(mode, 0o600);
});

test("saveConfig tightens an existing permissive file and directory", () => {
  mkdirSync(configDir(), { recursive: true, mode: 0o755 });
  writeFileSync(configPath(), "{}\n", { mode: 0o644 });
  chmodSync(configDir(), 0o755);
  chmodSync(configPath(), 0o644);

  saveConfig({ token: "secret" });

  assert.equal(statSync(configDir()).mode & 0o777, 0o700);
  assert.equal(statSync(configPath()).mode & 0o777, 0o600);
});

test("clearConfigKey also preserves owner-only permissions", () => {
  saveConfig({ token: "secret", org: "org_1" });
  chmodSync(configPath(), 0o644);
  clearConfigKey("token");
  assert.equal(statSync(configPath()).mode & 0o777, 0o600);
});

test("clearConfigKey drops one key and keeps the rest", () => {
  saveConfig({ apiUrl: "https://api.example", token: "secret", org: "acme" });
  clearConfigKey("token");
  assert.deepEqual(loadConfig(), {
    apiUrl: "https://api.example",
    org: "acme",
  });
});

test("deleteConfig removes the file", () => {
  saveConfig({ token: "secret" });
  assert.ok(existsSync(configPath()));
  deleteConfig();
  assert.ok(!existsSync(configPath()));
});

test("a corrupt config file is treated as empty", () => {
  saveConfig({ token: "secret" });
  // Overwrite with garbage.
  saveConfig({}); // ensure dir exists
  rmSync(configPath(), { force: true });
  // Write invalid JSON directly.
  writeFileSync(configPath(), "{not json");
  assert.deepEqual(loadConfig(), {});
});
