import { test } from "node:test";
import assert from "node:assert/strict";
import type { Command } from "commander";
import { buildProgram } from "../../program";

function find(name: string, of: Command): Command | undefined {
  return of.commands.find(
    (c) => c.name() === name || c.aliases().includes(name),
  );
}

test("only control-plane-backed cloud commands are registered", () => {
  const program = buildProgram();
  for (const name of ["servers", "db"]) {
    assert.ok(find(name, program), `${name} should exist`);
  }
  for (const name of ["k8s", "firewalls", "lb", "vpcs", "spaces"])
    assert.equal(find(name, program), undefined, `${name} has no API route`);
});

test("servers exposes its lifecycle subcommands and keeps the droplets alias", () => {
  const program = buildProgram();
  const servers = find("servers", program)!;
  assert.equal(find("droplets", program), servers);
  for (const c of ["ls", "get", "reboot", "power-off", "power-on", "rm"]) {
    assert.ok(find(c, servers), `servers ${c} should exist`);
  }
});

test("db exposes resize and health", () => {
  const db = find("db", buildProgram())!;
  for (const c of ["resize", "health"])
    assert.ok(find(c, db), `db ${c} should exist`);
});

test("help text never names an upstream infrastructure provider", () => {
  const seen: string[] = [];
  const walk = (cmd: Command) => {
    seen.push(cmd.helpInformation());
    cmd.commands.forEach(walk);
  };
  walk(buildProgram());
  assert.doesNotMatch(seen.join("\n"), /digital ?ocean|hetzner|contabo/i);
});
