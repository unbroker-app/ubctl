import { test } from "node:test";
import assert from "node:assert/strict";
import type { Command } from "commander";
import { buildProgram } from "../../program";

function find(name: string, of: Command): Command | undefined {
  return of.commands.find((c) => c.name() === name);
}

test("the apps command group is registered with its subcommands", () => {
  const program = buildProgram();
  const apps = find("apps", program);
  assert.ok(apps, "apps command should exist");

  const names = apps.commands.map((c) => c.name()).sort();
  assert.deepEqual(names, [
    "cancel",
    "connect",
    "connections",
    "deploy",
    "deployment",
    "deployments",
    "disconnect",
    "domains",
    "env",
    "projects",
    "rollback",
    "services",
  ]);
});

test("apps projects/services expose their CRUD subcommands", () => {
  const program = buildProgram();
  const apps = find("apps", program)!;
  const projects = find("projects", apps)!;
  const services = find("services", apps)!;

  for (const c of ["ls", "get", "create", "rename", "rm"]) {
    assert.ok(find(c, projects), `projects ${c} should exist`);
  }
  for (const c of ["ls", "get", "create", "rm", "logs", "metrics"]) {
    assert.ok(find(c, services), `services ${c} should exist`);
  }
});
