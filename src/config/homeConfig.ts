import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { z } from "zod";

export const CONFIG_DIR_ENV = "CUTAD_CONFIG_DIR";
export const API_KEY_ENV = "CUTAD_API_KEY";

export const DEFAULT_CONFIG = {
  apiKey: "",
  baseUrl: "https://ai.cutad.web.id/v1",
  model: "workbuddy/deepseek-v4.1-flash",
  maxOutputTokens: 8192,
  reasoning: { show: true, effort: "high" as string },
  agent: { maxIterations: 25, autoApprove: [] as string[], learnSkills: true },
  tools: { truncateKB: 64 },
  telemetry: { enabled: false },
};

export const ConfigSchema = z.object({
  apiKey: z.string(),
  baseUrl: z.string().min(1),
  model: z.string().min(1),
  maxOutputTokens: z.number().int().positive(),
  reasoning: z.object({
    show: z.boolean(),
    effort: z.string(),
  }),
  agent: z.object({
    maxIterations: z.number().int().positive(),
    autoApprove: z.array(z.string()),
    learnSkills: z.boolean().default(true),
  }),
  tools: z.object({ truncateKB: z.number().int().positive() }),
  telemetry: z.object({ enabled: z.boolean() }),
});

export type CutadConfig = z.infer<typeof ConfigSchema>;

export function configDir(): string {
  const override = process.env[CONFIG_DIR_ENV];
  if (override && override.trim()) return override.trim();
  return path.join(os.homedir(), ".cutad");
}

export function configPath(): string {
  return path.join(configDir(), "config.json");
}

export function mergeConfig(base: CutadConfig, patch: Partial<CutadConfig>): CutadConfig {
  return {
    ...base,
    ...patch,
    reasoning: { ...base.reasoning, ...(patch.reasoning ?? {}) },
    agent: { ...base.agent, ...(patch.agent ?? {}) },
    tools: { ...base.tools, ...(patch.tools ?? {}) },
    telemetry: { ...base.telemetry, ...(patch.telemetry ?? {}) },
  };
}

export function loadConfig(): CutadConfig {
  const p = configPath();
  let raw: Partial<CutadConfig> = {};
  if (fs.existsSync(p)) {
    const text = fs.readFileSync(p, "utf8");
    try {
      raw = JSON.parse(text) as Partial<CutadConfig>;
    } catch (err) {
      throw new Error(`Invalid JSON in ${p}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  const merged = mergeConfig(DEFAULT_CONFIG as CutadConfig, raw);
  const parsed = ConfigSchema.parse(merged);
  if (!parsed.apiKey && process.env[API_KEY_ENV]) {
    parsed.apiKey = process.env[API_KEY_ENV]!.trim();
  }
  return parsed;
}

export function saveConfig(patch: Partial<CutadConfig>): CutadConfig {
  const current = loadConfig();
  const merged = mergeConfig(current, patch);
  const dir = configDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(merged, null, 2) + "\n", "utf8");
  return merged;
}

export function ensureConfigFile(): string {
  const p = configPath();
  if (!fs.existsSync(p)) {
    fs.mkdirSync(configDir(), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n", "utf8");
  }
  return p;
}
