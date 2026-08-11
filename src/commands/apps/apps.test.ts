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
    "backups",
    "cancel",
    "connect",
    "connections",
    "databases",
    "deploy",
    "deployment",
    "deployments",
    "disconnect",
    "domains",
    "env",
    "projects",
    "rollback",
    "services",
    "volumes",
  ]);
});

test("apps exposes self-hosted databases, volumes, credentials and tunnels", () => {
  const apps = find("apps", buildProgram())!;
  const databases = find("databases", apps)!;
  const volumes = find("volumes", apps)!;
  for (const c of ["ls", "create", "get", "connection", "tunnel"])
    assert.ok(find(c, databases), `apps databases ${c} should exist`);
  for (const c of ["ls", "attach", "resize"])
    assert.ok(find(c, volumes), `apps volumes ${c} should exist`);
});

test("apps exposes persistent-volume backup lifecycle", () => {
  const backups = find("backups", find("apps", buildProgram())!)!;
  for (const c of ["ls", "schedule", "run", "restore", "destinations"])
    assert.ok(find(c, backups), `apps backups ${c} should exist`);
  const destinations = find("destinations", backups)!;
  for (const c of ["ls", "create", "rm"])
    assert.ok(
      find(c, destinations),
      `apps backups destinations ${c} should exist`,
    );
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
