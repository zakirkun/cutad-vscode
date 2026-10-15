import * as esbuild from "esbuild";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const stubPath = path.join(root, "scripts", "vscode-stub.mjs");
const outfile = path.join(root, "scripts", ".tools-manifest.mjs");

await esbuild.build({
  stdin: {
    contents: `
      import { createDefaultRegistry } from ${JSON.stringify(path.join(root, "src", "tools", "registry.ts"))};
      import { z } from "zod";
      const registry = createDefaultRegistry();
      const tools = registry.all().map((t) => {
        const schema = z.toJSONSchema(t.schema);
        delete schema.$schema;
        return {
          name: "cutad_" + t.id,
          tags: ["cutad"],
          toolReferenceName: t.id,
          displayName: t.displayName,
          modelDescription: t.description,
          userDescription: t.userDescription,
          canBeReferencedInPrompt: true,
          icon: "$(sparkle)",
          inputSchema: schema,
        };
      });
      process.stdout.write(JSON.stringify(tools, null, 2));
    `,
    resolveDir: root,
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile,
  alias: { vscode: stubPath },
  logLevel: "warning",
});

const { execSync } = await import("node:child_process");
const json = execSync(`node ${JSON.stringify(outfile)}`, { encoding: "utf8" });
const tools = JSON.parse(json);

const pkgPath = path.join(root, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
pkg.contributes.languageModelTools = tools;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
fs.rmSync(outfile, { force: true });

console.log(`[gen-tools] wrote ${tools.length} languageModelTools entries to package.json`);
