import { describe, it, expect } from "vitest";
import { loadConfig } from "../../src/config/homeConfig";
import { generatePlan } from "../../src/agent/plan/generate";
import { serializePlan, parsePlan } from "../../src/agent/plan/artifact";
import { hasLiveKey } from "../live";

const config = loadConfig();

describe.skipIf(!hasLiveKey())("plan generation (live gateway, structured output)", () => {
  it(
    "generates a valid multi-step plan for a goal",
    async () => {
      const result = await generatePlan({
        config,
        goal: "Add a health-check endpoint to a Node/Express app that returns version and uptime.",
        contextText: "",
        signal: new AbortController().signal,
      });

      expect(result.error).toBeUndefined();
      expect(result.plan).toBeDefined();
      const plan = result.plan!;

      expect(plan.title.length).toBeGreaterThan(0);
      expect(plan.goal.length).toBeGreaterThan(0);
      expect(plan.steps.length).toBeGreaterThanOrEqual(2);
      expect(plan.steps.length).toBeLessThanOrEqual(12);
      expect(plan.status).toBe("draft");

      for (const [i, step] of plan.steps.entries()) {
        expect(step.index).toBe(i + 1);
        expect(step.title.length).toBeGreaterThan(0);
        expect(step.objective.length).toBeGreaterThan(0);
        expect(step.status).toBe("pending");
      }

      const markdown = serializePlan(plan);
      const reparsed = parsePlan(plan.slug, markdown);
      expect(reparsed.steps.length).toBe(plan.steps.length);
      expect(reparsed.title).toBe(plan.title);
    },
    180_000,
  );
});
