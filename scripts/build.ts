#!/usr/bin/env bun
/**
 * Build ubctl.
 *
 *   bun scripts/build.ts                 npm package: dist/index.js for Node
 *   bun scripts/build.ts --compile       standalone binary for this machine
 *   bun scripts/build.ts --compile=all   binaries for every release target
 *
 * The interactive UI (OpenTUI) talks to its native renderer through Bun's FFI,
 * so it only ships in the compiled binaries. The Node build swaps the TUI entry
 * for a stub that explains how to get it, keeping OpenTUI out of the package.
 */
import solidPlugin from "@opentui/solid/bun-plugin";
import type { BunPlugin } from "bun";

const TARGETS = [
  "bun-linux-x64",
  "bun-linux-arm64",
  "bun-darwin-x64",
  "bun-darwin-arm64",
] as const;

// Modules that render with OpenTUI. Commands only reach them after a
// runtime check (`tuiSupported` / `canPrompt`), so on Node they are never
// called; the stub keeps OpenTUI and its native renderer out of the bundle.
const TUI_MODULES =
  /\/tui\/(launch|inline\/prompts|inline\/deploy|inline\/scale)$/;

const tuiStub: BunPlugin = {
  name: "ubctl-tui-stub",
  setup(build) {
    build.onResolve({ filter: TUI_MODULES }, (args) => ({
      path: args.path,
      namespace: "ubctl-stub",
    }));
    build.onLoad({ filter: /.*/, namespace: "ubctl-stub" }, () => ({
      loader: "js",
      contents: `const unavailable = async () => {
  throw new Error("the interactive UI needs the standalone ubctl binary; install it with scripts/install.sh");
};
export const launchTui = unavailable;
export const select = unavailable;
export const input = unavailable;
export const confirm = unavailable;
export const followDeployment = unavailable;
export const editScale = unavailable;`,
    }));
  },
};

const arg = process.argv.find((a) => a.startsWith("--compile"));

if (!arg) {
  const result = await Bun.build({
    entrypoints: ["src/index.ts"],
    target: "node",
    outdir: "dist",
    naming: "index.js",
    banner: "#!/usr/bin/env node",
    plugins: [tuiStub],
    // Tell the bundle it has no TUI, even if someone runs it under Bun.
    define: { "process.env.UBCTL_BUILD_TUI": JSON.stringify("0") },
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }
  console.log("built dist/index.js (node)");
} else {
  const all = arg === "--compile=all";
  const targets = all ? TARGETS : [undefined];
  for (const target of targets) {
    const outfile = target
      ? `out/ubctl-${target.replace(/^bun-/, "")}`
      : "out/ubctl";
    const result = await Bun.build({
      entrypoints: ["src/index.ts"],
      target: "bun",
      plugins: [solidPlugin],
      // A user's bunfig.toml or .env in the working directory must never
      // change how the released binary behaves.
      compile: {
        ...(target ? { target } : {}),
        outfile,
        autoloadBunfig: false,
        autoloadDotenv: false,
      },
      minify: true,
    });
    if (!result.success) {
      for (const log of result.logs) console.error(log);
      process.exit(1);
    }
    console.log(`built ${outfile}`);
  }
}
