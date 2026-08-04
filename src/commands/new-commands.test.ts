import { test } from "node:test";
import assert from "node:assert/strict";
import type { Command } from "commander";
import { buildProgram } from "../program";

function find(name: string, of: Command): Command | undefined {
  return of.commands.find(
    (c) => c.name() === name || c.aliases().includes(name),
  );
}

test("top-level product/management groups are registered", () => {
  const program = buildProgram();
  for (const name of ["beacon", "github", "team", "notifications"]) {
    assert.ok(find(name, program), `${name} should exist`);
  }
});

test("beacon exposes its full lifecycle + settings", () => {
  const beacon = find("beacon", buildProgram())!;
  for (const c of [
    "ls",
    "get",
    "create",
    "rm",
    "enable",
    "disable",
    "token",
    "usage",
    "channels",
    "channel",
    "publish",
    "settings",
  ]) {
    assert.ok(find(c, beacon), `beacon ${c} should exist`);
  }
  const settings = find("settings", beacon)!;
  for (const c of ["get", "set"]) {
    assert.ok(find(c, settings), `beacon settings ${c} should exist`);
  }
});

test("db (managed databases) exposes create/metrics/users/dbs", () => {
  const db = find("db", buildProgram())!;
  for (const c of [
    "ls",
    "get",
    "create",
    "connection",
    "metrics",
    "rm",
    "users",
    "dbs",
  ]) {
    assert.ok(find(c, db), `db ${c} should exist`);
  }
  for (const group of ["users", "dbs"]) {
    const g = find(group, db)!;
    for (const c of ["ls", "create", "rm"]) {
      assert.ok(find(c, g), `db ${group} ${c} should exist`);
    }
  }
});

test("github exposes installations/repos/branches", () => {
  const github = find("github", buildProgram())!;
  for (const c of ["installations", "repos", "branches"]) {
    assert.ok(find(c, github), `github ${c} should exist`);
  }
  const installations = find("installations", github)!;
  for (const c of ["ls", "rm"]) {
    assert.ok(find(c, installations), `github installations ${c} should exist`);
  }
});

test("team exposes roster + invitations management", () => {
  const team = find("team", buildProgram())!;
  for (const c of ["ls", "invite", "rm", "invitations"]) {
    assert.ok(find(c, team), `team ${c} should exist`);
  }
  const invitations = find("invitations", team)!;
  for (const c of ["ls", "rm"]) {
    assert.ok(find(c, invitations), `team invitations ${c} should exist`);
  }
});

test("apps services adds update/security; projects add env/manifest/duplicate/deploy-all", () => {
  const apps = find("apps", buildProgram())!;
  const services = find("services", apps)!;
  for (const c of ["update", "security"]) {
    assert.ok(find(c, services), `services ${c} should exist`);
  }
  const projects = find("projects", apps)!;
  for (const c of ["deploy-all", "manifest", "import", "duplicate", "env"]) {
    assert.ok(find(c, projects), `projects ${c} should exist`);
  }
});

test("orgs exposes implemented reads and account adds bandwidth/alerts", () => {
  const program = buildProgram();
  const orgs = find("orgs", program)!;
  for (const c of ["get", "billing"]) {
    assert.ok(find(c, orgs), `orgs ${c} should exist`);
  }
  assert.equal(find("connection", orgs), undefined);
  const account = find("account", program)!;
  for (const c of [
    "usage",
    "invoices",
    "activity",
    "bandwidth",
    "alerts",
    "charges",
    "cli-usage",
  ]) {
    assert.ok(find(c, account), `account ${c} should exist`);
  }
});

test("operational CLI groups are registered", () => {
  const program = buildProgram();
  for (const name of ["auth", "billing", "monitoring", "completion", "doctor"])
    assert.ok(find(name, program), `${name} should exist`);

  const monitoring = find("monitoring", program)!;
  for (const name of ["ls", "alert-create", "uptime-create", "check", "rm"])
    assert.ok(find(name, monitoring), `monitoring ${name} should exist`);
});
