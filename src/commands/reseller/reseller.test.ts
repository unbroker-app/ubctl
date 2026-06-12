import { test } from "node:test";
import assert from "node:assert/strict";
import type { Command } from "commander";
import { buildProgram } from "../../program";

function find(name: string, of: Command): Command | undefined {
  return of.commands.find((c) => c.name() === name);
}

test("all reseller resource commands are registered", () => {
  const program = buildProgram();
  for (const name of ["droplets", "db", "k8s", "firewalls", "lb", "vpcs", "spaces"]) {
    assert.ok(find(name, program), `${name} should exist`);
  }
});

test("droplets exposes its lifecycle subcommands", () => {
  const program = buildProgram();
  const droplets = find("droplets", program)!;
  for (const c of ["ls", "get", "reboot", "power-off", "power-on", "rm"]) {
    assert.ok(find(c, droplets), `droplets ${c} should exist`);
  }
});

test("k8s exposes kubeconfig", () => {
  const program = buildProgram();
  const k8s = find("k8s", program)!;
  assert.ok(find("kubeconfig", k8s));
});
