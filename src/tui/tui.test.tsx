// Interaction tests for the TUI. OpenTUI needs Bun, so this file runs under
// `bun test` (see `bun run test:tui`), not the Node test runner.
import { afterEach, beforeAll, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { testRender } from "@opentui/solid";
import { App } from "./app";
import type { ServicesResponse } from "../api/types";
import {
  apiError,
  fixtureSession,
  type RecordedRequest,
} from "./testing/fixtures";

type Setup = Awaited<ReturnType<typeof testRender>>;
let setup: Setup | undefined;

beforeAll(() => {
  // Never read the developer's real contexts from ~/.config/ubctl.
  process.env.XDG_CONFIG_HOME = mkdtempSync(join(tmpdir(), "ubctl-tui-"));
});

afterEach(() => {
  setup?.renderer.destroy();
  setup = undefined;
});

async function mount(
  overrides: Record<string, unknown> = {},
  seen: RecordedRequest[] = [],
) {
  setup = await testRender(
    () => (
      <App
        session={fixtureSession(overrides, seen)}
        reload={async () => fixtureSession(overrides, seen)}
      />
    ),
    { width: 130, height: 44, exitOnCtrlC: false },
  );
  await settle();
  return setup;
}

async function settle() {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    await setup!.renderOnce();
  }
}

async function press(...keys: string[]) {
  for (const key of keys) {
    if (key === "enter") setup!.mockInput.pressEnter();
    else if (key === "down") setup!.mockInput.pressArrow("down");
    else if (key === "backspace") setup!.mockInput.pressBackspace();
    else if (key === "esc") setup!.mockInput.pressEscape();
    else if (key === "D") setup!.mockInput.pressKey("d", { shift: true });
    else if (key === "ctrl+p") setup!.mockInput.pressKey("p", { ctrl: true });
    else setup!.mockInput.pressKey(key);
    await settle();
  }
}

const frame = () => setup!.captureCharFrame();

test("overview shows identity, services and 24h traffic", async () => {
  await mount();
  const screen = frame();
  expect(screen).toContain("UNBROKER CLOUD");
  expect(screen).toContain('token "ci" · org_acme');
  expect(screen).toContain("storefront");
  expect(screen).toContain("7.4k"); // visitors
  expect(screen).toContain("91.2k"); // requests
});

test("scale editor patches only the changed field", async () => {
  const seen: RecordedRequest[] = [];
  await mount({}, seen);
  // Services are sorted by project then name: storefront is third.
  await press("2", "down", "down", "s");
  expect(frame()).toContain("Scale storefront");
  await press("down", "down", "enter", "backspace", "backspace", "backspace");
  await setup!.mockInput.typeText("1000");
  await press("enter");
  expect(frame()).toContain("(was 512Mi)");
  await press("a");
  const patch = seen.find((r) => r.method === "PATCH");
  expect(patch).toEqual({
    method: "PATCH",
    path: "/apps/services/svc_web",
    body: { memoryLimit: 1000 },
  });
  expect(seen.some((r) => r.method === "POST")).toBe(false);
});

test("scale editor enforces the tier's replica ceiling before saving", async () => {
  const seen: RecordedRequest[] = [];
  await mount({}, seen);
  await press("2", "down", "down", "s");
  // Max replicas is the 6th field while autoscale is on.
  await press("down", "down", "down", "down", "down", "enter", "backspace");
  await setup!.mockInput.typeText("5");
  await press("enter", "a");
  expect(frame()).toContain("this tier allows at most 3 replicas");
  expect(seen.some((r) => r.method === "PATCH")).toBe(false);
});

test("shift+d saves and deploys", async () => {
  const seen: RecordedRequest[] = [];
  await mount({}, seen);
  await press("2", "down", "s"); // orders-api
  await press("enter", "backspace");
  await setup!.mockInput.typeText("2");
  await press("enter", "D");
  const writes = seen
    .filter((r) => r.method !== "GET")
    .map((r) => `${r.method} ${r.path}`);
  expect(writes).toEqual([
    "PATCH /apps/services/svc_api",
    "POST /apps/services/svc_api/deployments",
  ]);
});

test("analytics changes range and reports plan-gated breakdowns", async () => {
  const seen: RecordedRequest[] = [];
  const gated = apiError(402, "subscription_required", "Pro plan required");
  await mount({ "/traffic/breakdown/referer": gated }, seen);
  await press("3");
  expect(frame()).toContain("Requests · last 24 hours");
  expect(frame()).toContain("Breakdowns need the Pro plan.");
  await press("]");
  expect(seen.some((r) => r.path === "/traffic/overview?range=7d")).toBe(true);
});

test("service detail shows live usage against limits", async () => {
  await mount();
  await press("2", "down", "down", "enter", "l");
  const screen = frame();
  expect(screen).toContain("autoscale 2-3 @ 70% CPU");
  expect(screen).toContain("storefront-7f9c-abcde");
  expect(screen).toContain("180m / 500m");
});

test("private services hide calculated URLs in the list and detail views", async () => {
  const { services } =
    await fixtureSession().client.get<ServicesResponse>("/apps/services");
  const service = {
    ...services.find((s) => s.id === "svc_web")!,
    private: true,
    routed: false,
    host: "storefront.ub-apps.svc.cluster.local",
    url: "https://private-calculated.example.test",
  };
  await mount({
    "/apps/services": { services: [service] },
    "/apps/services/svc_web": { service },
  });
  await press("2");
  expect(frame()).toContain("private");
  expect(frame()).not.toContain("https://private");
  await press("enter");
  expect(frame()).toContain("private (internal)");
  expect(frame()).toContain(service.host);
  expect(frame()).not.toContain("private-calculated.example.test");
});

test("ctrl+c closes an open dialog instead of quitting", async () => {
  await mount();
  await press("ctrl+p");
  expect(frame()).toContain("Commands");
  setup!.mockInput.pressCtrlC();
  await settle();
  expect(frame()).not.toContain("Type a command");
  expect(setup!.renderer.isDestroyed).toBe(false);
});

test("esc does not close the scale editor while a save is in flight", async () => {
  const seen: RecordedRequest[] = [];
  await mount({ __delay_PATCH: 400 }, seen);
  await press("2", "down", "down", "s", "enter", "backspace");
  await setup!.mockInput.typeText("3");
  await press("enter", "a", "esc");
  expect(frame()).toContain("Scale storefront");
  await new Promise((resolve) => setTimeout(resolve, 600));
  await settle();
  // The save finished and closed the editor itself.
  expect(frame()).not.toContain("Scale storefront");
  expect(seen.filter((r) => r.method === "PATCH").length).toBe(1);
});
