import { describe, it, expect } from "vitest";
import { loadConfig, configPath } from "../../src/config/homeConfig";
import { listModels, createProvider } from "../../src/llm/gateway";
import { streamText } from "ai";

const config = loadConfig();

describe("home config", () => {
  it("loads from ~/.cutad/config.json with key and model", () => {
    expect(configPath()).toContain(".cutad");
    expect(config.apiKey.startsWith("cag_")).toBe(true);
    expect(config.baseUrl).toBe("https://ai.cutad.web.id/v1");
    expect(config.model).toBe("workbuddy/deepseek-v4.1-flash");
  });
});

describe("real gateway", () => {
  it("lists models including the configured one", async () => {
    const models = await listModels(config);
    expect(models.length).toBeGreaterThan(0);
    const ids = models.map((m) => m.id);
    expect(ids).toContain("workbuddy/deepseek-v4.1-flash");
    const target = models.find((m) => m.id === "workbuddy/deepseek-v4.1-flash")!;
    expect(target.contextWindow).toBeGreaterThan(0);
    expect(target.maxOutputTokens).toBeGreaterThan(0);
  });

  it("answers a non-streaming completion", async () => {
    const provider = createProvider(config);
    const result = await streamText({
      model: provider.chatModel(config.model),
      prompt: "Reply with exactly: PONG",
      maxOutputTokens: 64,
    });
    const text = await result.text;
    expect(text.length).toBeGreaterThan(0);
  });

  it("streams text deltas", async () => {
    const provider = createProvider(config);
    const result = streamText({
      model: provider.chatModel(config.model),
      prompt: "Count from 1 to 5, one number per line.",
      maxOutputTokens: 128,
    });
    const deltas: string[] = [];
    for await (const part of result.stream) {
      if (part.type === "text-delta") deltas.push(part.text);
    }
    expect(deltas.length).toBeGreaterThan(0);
    expect(deltas.join("")).toMatch(/1/);
  });

  it("emits separated reasoning deltas when reasoningEffort is set (S-4)", async () => {
    const provider = createProvider(config);
    const result = streamText({
      model: provider.chatModel(config.model),
      prompt: "Think step by step: what is 17 * 23?",
      maxOutputTokens: 4096,
      providerOptions: { cutad: { reasoningEffort: "high" } },
    });
    let reasoning = "";
    let text = "";
    for await (const part of result.stream) {
      if (part.type === "reasoning-delta") reasoning += part.text;
      if (part.type === "text-delta") text += part.text;
    }
    expect(reasoning.length).toBeGreaterThan(0);
    expect(text.length).toBeGreaterThan(0);
    const usage = await result.usage;
    expect(usage.outputTokenDetails?.reasoningTokens ?? 0).toBeGreaterThan(0);
  });

  it("rejects a bad key with a gateway error", async () => {
    const bad = { ...config, apiKey: "cag_invalid_key_for_test" };
    await expect(listModels(bad)).rejects.toMatchObject({ status: 401 });
  });
});
