import { test } from "node:test";
import assert from "node:assert/strict";
import type { Command } from "commander";
import { buildProgram } from "../program";

function find(name: string, of: Command): Command | undefined {
  return of.commands.find((c) => c.name() === name);
}

test("tokens, account and orgs commands are registered", () => {
  const program = buildProgram();
  assert.ok(find("tokens", program));
  assert.ok(find("account", program));
  assert.ok(find("orgs", program));
});

test("tokens and account expose their subcommands", () => {
  const program = buildProgram();
  const tokens = find("tokens", program)!;
  const account = find("account", program)!;

  for (const c of ["ls", "create", "rm"]) {
    assert.ok(find(c, tokens), `tokens ${c} should exist`);
  }
  for (const c of ["usage", "invoices", "activity"]) {
    assert.ok(find(c, account), `account ${c} should exist`);
  }
});
