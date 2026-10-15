import { loadConfig } from "../src/config/homeConfig";

/**
 * Live-gateway tests need a real CutadAI API key.
 * - Local: the key comes from ~/.cutad/config.json.
 * - CI: the key comes from the CUTAD_API_KEY secret.
 * Without a real key, live tests are skipped instead of failing.
 */
export function hasLiveKey(): boolean {
  try {
    const config = loadConfig();
    return config.apiKey.startsWith("cag_") && !config.apiKey.includes("invalid");
  } catch {
    return false;
  }
}

export const LIVE_SKIP_REASON =
  "No live CutadAI API key configured (set ~/.cutad/config.json or CUTAD_API_KEY) — live gateway tests skipped.";
