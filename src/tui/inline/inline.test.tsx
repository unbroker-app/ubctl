// Interaction tests for the inline prompts used by regular commands. Runs
// under `bun test` (OpenTUI needs Bun), like the dashboard tests.
import { afterEach, expect, test } from "bun:test";
import { testRender } from "@opentui/solid";
import { ApiClient } from "../../api/client";
import { ThemeProvider } from "../context/theme";
import { Follow, type FollowResult } from "./deploy";
import { Confirm, Input, Select } from "./prompts";

type Setup = Awaited<ReturnType<typeof testRender>>;
let setup: Setup | undefined;

afterEach(() => {
  setup?.renderer.destroy();
  setup = undefined;
});

async function settle() {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setTimeout(resolve, 15));
    await setup!.renderOnce();
  }
}

const choices = [
  { title: "storefront", value: "svc_web", hint: "Shop · running" },
  { title: "orders-api", value: "svc_api", hint: "Shop · running" },
  { title: "nightly-jobs", value: "svc_jobs", hint: "Ops · stopped" },
];

test("select filters by typing and returns the chosen value", async () => {
  let result: string | undefined = "unset";
  setup = await testRender(
    () => (
      <ThemeProvider>
        <Select
          options={{ message: "Service", choices }}
          finish={(v) => (result = v)}
        />
      </ThemeProvider>
    ),
    { width: 80, height: 8 },
  );
  await settle();
  expect(setup.captureCharFrame()).toContain("› storefront");
  await setup.mockInput.typeText("night");
  await settle();
  expect(setup.captureCharFrame()).toContain("› nightly-jobs");
  setup.mockInput.pressEnter();
  await settle();
  expect(result).toBe("svc_jobs");
});

test("select moves with arrows and cancels with esc", async () => {
  let result: string | undefined = "unset";
  setup = await testRender(
    () => (
      <ThemeProvider>
        <Select
          options={{ message: "Service", choices, initial: "svc_api" }}
          finish={(v) => (result = v)}
        />
      </ThemeProvider>
    ),
    { width: 80, height: 8 },
  );
  await settle();
  expect(setup.captureCharFrame()).toContain("› orders-api");
  setup.mockInput.pressArrow("down");
  await settle();
  expect(setup.captureCharFrame()).toContain("› nightly-jobs");
  setup.mockInput.pressEscape();
  await settle();
  expect(result).toBeUndefined();
});

test("input validates before accepting", async () => {
  let result: string | undefined = "unset";
  setup = await testRender(
    () => (
      <ThemeProvider>
        <Input
          options={{
            message: "Service name",
            initial: "web",
            validate: (v) => (v.length > 3 ? undefined : "too short"),
          }}
          finish={(v) => (result = v)}
        />
      </ThemeProvider>
    ),
    { width: 60, height: 4 },
  );
  await settle();
  setup.mockInput.pressEnter();
  await settle();
  expect(setup.captureCharFrame()).toContain("too short");
  expect(result).toBe("unset");
  await setup.mockInput.typeText("-store");
  setup.mockInput.pressEnter();
  await settle();
  expect(result).toBe("web-store");
});

test("confirm answers with y/n and enter", async () => {
  let result: boolean | undefined;
  setup = await testRender(
    () => (
      <ThemeProvider>
        <Confirm
          message="Deploy it now?"
          initial={true}
          finish={(v) => (result = v)}
        />
      </ThemeProvider>
    ),
    { width: 60, height: 2 },
  );
  await settle();
  setup.mockInput.pressKey("n");
  await settle();
  expect(result).toBe(false);
});

test("deploy follow streams the build log and finishes on live", async () => {
  let polls = 0;
  const fetchFn = (async () => {
    polls++;
    const status = polls < 3 ? "building" : "live";
    const buildLog = ["step one", "step two", "step three"]
      .slice(0, polls)
      .join("\n");
    return new Response(
      JSON.stringify({
        deployment: {
          id: "dep_1",
          status,
          buildLog: buildLog + "\n",
          createdAt: 0,
          finishedAt: status === "live" ? 1 : null,
        },
      }),
    );
  }) as unknown as typeof fetch;
  const client = new ApiClient({ apiUrl: "https://api.test", fetchFn });
  const printed: string[] = [];
  const write = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string) => {
    printed.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  let result: FollowResult | undefined;
  try {
    setup = await testRender(
      () => (
        <ThemeProvider>
          <Follow
            client={client}
            deploymentId="dep_1"
            label="storefront"
            timeoutMs={60_000}
            finish={(r) => (result = r)}
          />
        </ThemeProvider>
      ),
      { width: 80, height: 3 },
    );
    await settle();
    expect(setup.captureCharFrame()).toContain("Deploying storefront");
    expect(setup.captureCharFrame()).toContain("● building");
    for (let i = 0; i < 40 && !result; i++)
      await new Promise((resolve) => setTimeout(resolve, 100));
  } finally {
    process.stdout.write = write;
  }
  expect(result?.kind).toBe("done");
  expect(printed.join("")).toBe("  step one\n  step two\n  step three\n");
});
