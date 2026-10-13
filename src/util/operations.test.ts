import { test } from "node:test";
import assert from "node:assert/strict";
import { bar, columnChart, compact, gauge, resample, sparkline } from "./chart";
import { bytes, millis } from "./format";
import {
  DEFAULT,
  describeScale,
  nullableInteger,
  scaleDiff,
  scalePatch,
  validateScale,
} from "./scale";
import {
  trafficDimension,
  trafficQuery,
  trafficRange,
  stepLabel,
} from "./traffic";
import { fuzzyFilter, fuzzyScore } from "../tui/lib/fuzzy";
import { keyName } from "../tui/lib/keys";

test("sparkline scales from zero and resamples to width", () => {
  assert.equal(sparkline([0, 7]), "▁█");
  assert.equal(sparkline([5, 5, 5]), "███");
  assert.equal(sparkline([0, 0]), "▁▁");
  assert.equal(sparkline([]), "");
  assert.equal(sparkline([1, 1, 9, 9], 2), "▂█");
  assert.deepEqual(resample([1, 3, 5, 7], 2), [2, 6]);
});

test("bars, gauges and column charts", () => {
  assert.equal(bar(5, 10, 4), "██");
  assert.equal(bar(0, 10, 4), "");
  assert.equal(gauge(50, 100, 4), "██░░ 50%");
  assert.equal(gauge(1, 0), "-");
  assert.deepEqual(columnChart([0, 2, 4], 3, 2), ["  █", " ██"]);
});

test("number formatting", () => {
  assert.equal(compact(950), "950");
  assert.equal(compact(1_250), "1.3k");
  assert.equal(compact(3_400_000), "3.4M");
  assert.equal(bytes(870_000_000), "870 MB");
  assert.equal(bytes(512), "512 B");
  assert.equal(millis(142), "142ms");
  assert.equal(millis(1500), "1.5s");
});

test("nullable scale values accept units and reset words", () => {
  const cpu = nullableInteger("cpu", 100, 2000);
  assert.equal(cpu("500m"), 500);
  assert.equal(cpu("default"), DEFAULT);
  assert.throws(() => cpu("50"), /between 100 and 2000/);
  assert.throws(() => cpu("half"), /integer/);
  assert.deepEqual(scalePatch({ cpu: DEFAULT, replicas: 2 }), {
    replicas: 2,
    cpuLimit: null,
  });
});

test("validateScale mirrors the API's cross-field rules", () => {
  const base = { replicas: 2, autoscale: false };
  assert.equal(
    validateScale(base, { replicas: 4 }, 3),
    "this tier allows at most 3 replicas (replicas = 4)",
  );
  assert.match(
    validateScale(base, { autoscale: true, minReplicas: 3, maxReplicas: 2 })!,
    /must not exceed/,
  );
  assert.match(
    validateScale(base, { autoscale: true, scaleOnCpu: false })!,
    /at least one trigger/,
  );
  assert.equal(
    validateScale(base, {
      autoscale: true,
      scaleOnCpu: false,
      targetMemoryPercent: 80,
    }),
    undefined,
  );
  assert.match(
    validateScale(base, { scaleWindowEnabled: true })!,
    /requires autoscale/,
  );
  assert.match(
    validateScale(base, {
      autoscale: true,
      scaleWindowEnabled: true,
      scaleWindowMin: 2,
      scaleWindowStart: "18:00",
      scaleWindowEnd: "09:00",
      scaleWindowTz: "UTC",
    })!,
    /before --window-end/,
  );
});

test("scale descriptions and diffs", () => {
  assert.equal(describeScale({ replicas: 1 }), "1 replica");
  assert.equal(
    describeScale({
      autoscale: true,
      minReplicas: 2,
      maxReplicas: 5,
      targetMemoryPercent: 80,
    }),
    "autoscale 2-5 @ 70% CPU, 80% memory",
  );
  assert.deepEqual(scaleDiff({ replicas: 1 }, { replicas: 1 }), []);
  assert.deepEqual(scaleDiff({ replicas: 1 }, { replicas: 2 }), [
    { field: "scale", before: "1 replica", after: "2 replicas" },
  ]);
});

test("traffic ranges, dimensions and scoped queries", () => {
  assert.equal(trafficRange("3m"), "90d");
  assert.equal(trafficRange("12M"), "365d");
  assert.throws(() => trafficRange("2w"), /range must be one of/);
  assert.equal(trafficDimension("referrers"), "referer");
  assert.equal(trafficDimension("utm-source"), "utm_source");
  assert.throws(() => trafficDimension("planet"), /dimension must be one of/);
  // Only the narrowest scope is sent.
  assert.equal(
    trafficQuery(
      { serviceId: "s", projectId: "p", environment: "preview" },
      { range: "7d" },
    ),
    "?range=7d&serviceId=s",
  );
  assert.equal(trafficQuery({}, {}), "");
  assert.equal(stepLabel(15 * 60_000), "15 min");
  assert.equal(stepLabel(86_400_000), "1 day");
});

test("fuzzy filter ranks prefix matches first", () => {
  assert.ok(fuzzyScore("sto", "storefront") > fuzzyScore("sto", "big-store"));
  assert.equal(fuzzyScore("xyz", "storefront"), -1);
  assert.deepEqual(
    fuzzyFilter("api", ["web", "orders-api", "api"], (s) => [s]),
    ["api", "orders-api"],
  );
});

test("keyName normalizes modifiers", () => {
  const key = (
    name: string,
    mods: Partial<{ ctrl: boolean; shift: boolean; meta: boolean }> = {},
  ) => ({
    name,
    ctrl: false,
    meta: false,
    shift: false,
    ...mods,
  });
  assert.equal(keyName(key("p", { ctrl: true })), "ctrl+p");
  assert.equal(keyName(key("tab", { shift: true })), "shift+tab");
  assert.equal(keyName(key("enter")), "return");
});

test("service names default from the repository", async () => {
  const { nameFromRepo } = await import("../commands/apps/create-wizard");
  assert.equal(
    nameFromRepo("https://github.com/acme/Web_Store.git"),
    "web-store",
  );
  assert.equal(nameFromRepo("https://gitlab.com/group/sub/api/"), "api");
});

test("colors are off without a terminal and with NO_COLOR", async () => {
  const { color, statusText, visibleLength } = await import("./color");
  const saved = process.env.FORCE_COLOR;
  process.env.FORCE_COLOR = "1";
  process.env.NO_COLOR = "1";
  try {
    assert.equal(statusText("running"), "running");
  } finally {
    delete process.env.NO_COLOR;
  }
  assert.equal(statusText("failed"), "\x1b[31mfailed\x1b[39m");
  assert.equal(visibleLength(color.bold("abc")), 3);
  if (saved === undefined) delete process.env.FORCE_COLOR;
  else process.env.FORCE_COLOR = saved;
});
