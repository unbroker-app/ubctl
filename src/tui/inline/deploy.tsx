import { TextAttributes } from "@opentui/core";
import { useKeyboard } from "@opentui/solid";
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { ApiError, type ApiClient } from "../../api/client";
import type {
  Deployment,
  DeploymentResponse,
  DeploymentStatus,
} from "../../api/types";
import { useTheme } from "../context/theme";
import { matches } from "../lib/keys";
import { runInline } from "./host";

const STAGES: DeploymentStatus[] = ["queued", "building", "deploying", "live"];
const TERMINAL: DeploymentStatus[] = [
  "live",
  "failed",
  "superseded",
  "cancelled",
];
const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export type FollowResult =
  | { kind: "done"; deployment: Deployment }
  /** `user`: q/esc; `interrupt`: ctrl+c; `timeout`: the wait expired. */
  | {
      kind: "detached";
      reason: "user" | "interrupt" | "timeout";
      deployment: Deployment | undefined;
    }
  /** A non-retryable API error (auth, not found, …). */
  | { kind: "error"; message: string; deployment: Deployment | undefined };

/**
 * Follow a deployment live: new build-log lines are printed above (they stay
 * in the terminal's scrollback) while the footer tracks the stage, elapsed
 * time and how to detach.
 */
export function Follow(props: {
  client: ApiClient;
  deploymentId: string;
  label: string;
  timeoutMs: number;
  finish: (result: FollowResult | undefined) => void;
}) {
  const theme = useTheme();
  const [deployment, setDeployment] = createSignal<Deployment>();
  const [frame, setFrame] = createSignal(0);
  const [error, setError] = createSignal<string>();
  const started = Date.now();
  let printed = 0;
  let lastPrinted: string | undefined;
  let stopped = false;

  async function poll() {
    while (!stopped) {
      try {
        const { deployment: d } = await props.client.get<DeploymentResponse>(
          `/apps/deployments/${props.deploymentId}`,
        );
        setDeployment(d);
        setError(undefined);
        const lines = (d.buildLog ?? "").split("\n");
        // The last line may still be growing; print it once it's complete.
        const complete = TERMINAL.includes(d.status)
          ? lines.length
          : lines.length - 1;
        // The API keeps only the tail of very long logs, so lines can shift
        // left between polls. Re-anchor on the last line we printed.
        if (printed > 0 && lines[printed - 1] !== lastPrinted) {
          const anchor = lines
            .slice(0, complete)
            .lastIndexOf(lastPrinted ?? "");
          if (anchor >= 0) printed = anchor + 1;
          else {
            process.stdout.write("  … (earlier log lines truncated)\n");
            printed = 0;
          }
        }
        for (; printed < complete; printed++) {
          const line = lines[printed]!;
          if (line || printed < complete - 1)
            process.stdout.write(`  ${line}\n`);
          lastPrinted = line;
        }
        if (TERMINAL.includes(d.status))
          return props.finish({ kind: "done", deployment: d });
      } catch (err) {
        // Transport errors, 429 and 5xx are worth retrying; a 4xx won't fix
        // itself (expired token, deployment gone).
        const status = err instanceof ApiError ? err.status : 0;
        const message = err instanceof Error ? err.message : String(err);
        if (status >= 400 && status < 500 && status !== 408 && status !== 429)
          return props.finish({
            kind: "error",
            message,
            deployment: deployment(),
          });
        setError(message);
      }
      if (Date.now() - started > props.timeoutMs)
        return props.finish({
          kind: "detached",
          reason: "timeout",
          deployment: deployment(),
        });
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  onMount(() => void poll());
  const spin = setInterval(() => setFrame((f) => f + 1), 80);
  spin.unref?.();
  onCleanup(() => {
    stopped = true;
    clearInterval(spin);
  });

  useKeyboard((key) => {
    if (matches(key, "ctrl+c"))
      props.finish({
        kind: "detached",
        reason: "interrupt",
        deployment: deployment(),
      });
    else if (matches(key, "q", "escape"))
      props.finish({
        kind: "detached",
        reason: "user",
        deployment: deployment(),
      });
  });

  const status = () => deployment()?.status ?? "queued";
  const stageIndex = () => STAGES.indexOf(status());
  const elapsed = () => {
    void frame();
    const secs = Math.floor((Date.now() - started) / 1000);
    return secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m${secs % 60}s`;
  };

  return (
    <box flexDirection="column" paddingLeft={1}>
      <text wrapMode="none">
        <span style={{ fg: theme.primary }}>
          {SPINNER[frame() % SPINNER.length]}{" "}
        </span>
        <span style={{ fg: theme.text }}>
          <b>Deploying {props.label}</b>
        </span>
        <span style={{ fg: theme.textMuted }}>
          {"  "}
          {props.deploymentId} · {elapsed()}
        </span>
      </text>
      <text wrapMode="none">
        <span>{"  "}</span>
        <For each={STAGES}>
          {(stage, i) => {
            const done = () => stageIndex() > i();
            const current = () => stageIndex() === i();
            return (
              <>
                <span
                  style={{
                    fg: current()
                      ? theme.primary
                      : done()
                        ? theme.success
                        : theme.textSubtle,
                    attributes: current() ? TextAttributes.BOLD : 0,
                  }}
                >
                  {done() ? "✔ " : current() ? "● " : "○ "}
                  {stage}
                </span>
                <Show when={i() < STAGES.length - 1}>
                  <span style={{ fg: theme.textSubtle }}> ─ </span>
                </Show>
              </>
            );
          }}
        </For>
      </text>
      <Show
        when={error()}
        fallback={
          <text fg={theme.textSubtle}>
            {"  "}q detach (the deployment keeps running)
          </text>
        }
      >
        <text fg={theme.warning}>
          {"  "}retrying: {error()}
        </text>
      </Show>
    </box>
  );
}

export function followDeployment(
  client: ApiClient,
  deploymentId: string,
  label: string,
  timeoutMs: number,
): Promise<FollowResult | undefined> {
  return runInline<FollowResult>(3, (finish) => (
    <Follow
      client={client}
      deploymentId={deploymentId}
      label={label}
      timeoutMs={timeoutMs}
      finish={finish}
    />
  ));
}
