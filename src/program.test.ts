import { test } from "node:test";
import assert from "node:assert/strict";
import { buildProgram } from "./program";
import { VERSION } from "./version";

test("the root program is named ubctl and reports its version", () => {
  const program = buildProgram();
  assert.equal(program.name(), "ubctl");
  assert.equal(program.version(), VERSION);
});

test("global flags are declared on the root program", () => {
  const program = buildProgram();
  const flags = program.options.map((o) => o.long);
  for (const flag of ["--org", "--api-url", "--json"]) {
    assert.ok(flags.includes(flag), `expected ${flag} to be declared`);
  }
});
