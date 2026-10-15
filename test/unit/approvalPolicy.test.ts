import { describe, it, expect } from "vitest";
import { decidePolicy, SessionApprovals, normalizeDecision } from "../../src/tools/approvalPolicy";

const trusted = { autoApprove: [] as string[], trusted: true };
const untrusted = { autoApprove: [] as string[], trusted: false };
const noSession = new Set<string>();

describe("approvalPolicy", () => {
  it("auto-allows read-only tools", () => {
    const outcome = decidePolicy({ toolId: "read_file", readOnly: true, destructive: false }, trusted, noSession);
    expect(outcome.kind).toBe("auto-allow");
  });

  it("asks for mutating tools", () => {
    const outcome = decidePolicy({ toolId: "apply_patch", readOnly: false, destructive: false }, trusted, noSession);
    expect(outcome).toEqual({ kind: "must-ask", forced: false });
  });

  it("auto-allows session-approved tools", () => {
    const session = new Set(["apply_patch"]);
    const outcome = decidePolicy({ toolId: "apply_patch", readOnly: false, destructive: false }, trusted, session);
    expect(outcome.kind).toBe("auto-allow");
  });

  it("auto-allows config-approved tools", () => {
    const policy = { autoApprove: ["write_file"], trusted: true };
    const outcome = decidePolicy({ toolId: "write_file", readOnly: false, destructive: false }, policy, noSession);
    expect(outcome.kind).toBe("auto-allow");
  });

  it("forces a prompt for destructive tools even when auto-approved", () => {
    const policy = { autoApprove: ["run_command"], trusted: true };
    const session = new Set(["run_command"]);
    const outcome = decidePolicy({ toolId: "run_command", readOnly: false, destructive: true }, policy, session);
    expect(outcome).toEqual({ kind: "must-ask", forced: true });
  });

  it("denies mutating tools in untrusted workspaces", () => {
    const outcome = decidePolicy({ toolId: "apply_patch", readOnly: false, destructive: false }, untrusted, noSession);
    expect(outcome.kind).toBe("deny-untrusted");
  });

  it("still allows read-only tools in untrusted workspaces", () => {
    const outcome = decidePolicy({ toolId: "read_file", readOnly: true, destructive: false }, untrusted, noSession);
    expect(outcome.kind).toBe("auto-allow");
  });

  it("tracks session approvals", () => {
    const approvals = new SessionApprovals();
    expect(approvals.has("x")).toBe(false);
    approvals.allow("x");
    expect(approvals.has("x")).toBe(true);
    approvals.clear();
    expect(approvals.has("x")).toBe(false);
  });

  it("normalizes decisions", () => {
    expect(normalizeDecision("allow")).toBe("allow");
    expect(normalizeDecision("allow-session")).toBe("allow");
    expect(normalizeDecision("deny")).toBe("deny");
  });
});
