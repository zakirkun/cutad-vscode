// esbuild bundler for the Cutad.AI VS Code extension.
// Entries:
//   src/extension.ts        -> dist/extension.js   (the extension bundle; `vscode` is external)
//   src/spikes/hostSmoke.ts -> dist/host-smoke.js  (S-3 host-proxy spike; runs in plain Node)
import esbuild from "esbuild";

const watch = process.argv.includes("--watch");

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: [
    { in: "src/extension.ts", out: "extension" },
    { in: "src/spikes/hostSmoke.ts", out: "host-smoke" },
    { in: "src/spikes/reasoningSpike.ts", out: "reasoning-spike" },
  ],
  outdir: "dist",
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node22",
  external: ["vscode"],
  sourcemap: true,
  minify: false,
  logLevel: "info",
  // Some ESM-only dependencies (ai, @ai-sdk/*) rely on the "import" export condition.
  conditions: ["node", "import"],
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log("[esbuild] watching…");
} else {
  await esbuild.build(options);
  console.log("[esbuild] build complete");
}
