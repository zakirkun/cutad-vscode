import * as vscode from "vscode";
import { loadConfig, configPath } from "../config/homeConfig";
import { runAsk, type AgentEvent } from "../llm/runtime";
import { runAgent } from "../llm/agentRuntime";
import { assembleContext } from "../context/assembler";
import { newRenderState, renderEvent, errorAction } from "./render";
import { createDefaultRegistry } from "../tools/registry";
import { ApprovalGate, approvalRequestFor } from "../tools/approvalGate";
import { registerLmTools } from "../tools/lmTools";
import type { ToolRegistry } from "../tools/spec";
import { getLogger } from "../util/logger";
import { generatePlan } from "../agent/plan/generate";
import {
  buildPlanExecGraph,
  runPlanGraph,
  type StepApprovalRequest,
  type StepDecision,
} from "../agent/plan/graph";
import { planProgress, type PlanArtifact } from "../agent/plan/artifact";
import { SessionStore } from "../storage/sessionStore";
import { MemoryState } from "../storage/memoryState";
import { TempWorkspace } from "../storage/tempWorkspace";
import { SkillEngine, ensureSkillUsageTable } from "../skills/engine";
import { maybeLearnSkill } from "../agent/skillLearner";
import { Command } from "@langchain/langgraph";

export const PARTICIPANT_ID = "cutad.chat";

let registry: ToolRegistry | undefined;
let gate: ApprovalGate | undefined;
let skillEngine: SkillEngine | undefined;
const planGraphs = new Map<string, ReturnType<typeof buildPlanExecGraph>>();

interface ChatSession {
  store: SessionStore;
  memory: MemoryState;
  temp: TempWorkspace;
  planQueue: string[];
}

const sessions = new Map<string, ChatSession>();

function sessionFor(request: vscode.ChatRequest, model: string): ChatSession {
  const key = `${vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "no-workspace"}`;
  let session = sessions.get(key);
  if (!session) {
    const store = SessionStore.create(key, model);
    session = {
      store,
      memory: new MemoryState(store.sessionId, key, model),
      temp: new TempWorkspace(store.sessionId),
      planQueue: [],
    };
    sessions.set(key, session);
    getLogger().info(`[session] created ${store.sessionId} (home: ~/.cutad, temp: ${session.temp.root})`);
  }
  return session;
}

export function getActiveSession(): ChatSession | undefined {
  return [...sessions.values()][0];
}

export function getSkillEngine(): SkillEngine | undefined {
  return skillEngine;
}

export function registerParticipant(context: vscode.ExtensionContext): void {
  ensureSkillUsageTable();
  skillEngine = new SkillEngine();
  const seeded = skillEngine.seedBuiltins();
  if (seeded.length > 0) {
    getLogger().info(`[skills] seeded ${seeded.length} builtin skill(s) to ~/.cutad/skills/`);
  }

  gate = new ApprovalGate(() => ({
    autoApprove: loadConfig().agent.autoApprove,
    trusted: vscode.workspace.isTrusted,
  }));

  registry = createDefaultRegistry({
    skillEngine,
    sessionId: () => getActiveSession()?.store.sessionId ?? "unknown",
    delegation: {
      config: loadConfig,
      registry: () => registry,
      workspaceRoot: () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
      token: () => activeToken ?? new vscode.CancellationTokenSource().token,
      onEvent: (event) => activeOnEvent?.(event),
      signal: () => activeSignal ?? new AbortController().signal,
      sessionId: () => getActiveSession()?.store.sessionId ?? "unknown",
      recordDelegation: (specialist, task, ok, summary) => {
        getActiveSession()?.store.recordDelegation(specialist, task, ok, summary);
      },
    },
  });

  registerLmTools(context, registry, gate);

  const participant = vscode.chat.createChatParticipant(PARTICIPANT_ID, handler);
  participant.followupProvider = {
    provideFollowups(result) {
      const mode = (result.metadata as { mode?: string } | undefined)?.mode;
      if (mode === "help") return [];
      if (mode === "plan-created") {
        return [
          { prompt: "/plan execute", label: "Execute this plan" },
          { prompt: "Revise the plan", label: "Revise plan" },
        ];
      }
      return [
        { prompt: "Explain that in more detail", label: "Explain further" },
        { prompt: "Show a code example", label: "Show code example" },
        { prompt: "What should I do next?", label: "Next steps" },
      ];
    },
  };
  context.subscriptions.push(participant);
  getLogger().info(
    `[chat] participant registered: @${PARTICIPANT_ID} (${registry.all().length} tools, ${skillEngine.list().length} skills)`,
  );
}

let activeToken: vscode.CancellationToken | undefined;
let activeOnEvent: ((event: AgentEvent) => void) | undefined;
let activeSignal: AbortSignal | undefined;

const handler: vscode.ChatRequestHandler = async (
  request,
  context,
  stream,
  token,
): Promise<vscode.ChatResult> => {
  const log = getLogger();
  const config = loadConfig();
  const command = request.command ?? "ask";
  log.info(`[chat] command=${command} model=${config.model}`);

  if (!config.apiKey) {
    stream.markdown(
      `**No API key configured.**\n\nAdd your key to \`${configPath()}\` or run **Cutad.AI: Set API Key**.`,
    );
    return { metadata: { mode: "help" } };
  }

  if (command === "help") {
    stream.markdown(helpMarkdown(config.model, registry?.all().length ?? 0));
    return { metadata: { mode: "help" } };
  }

  const notice = modeNotice(command);
  if (notice) {
    stream.markdown(notice);
    return { metadata: { mode: "help" } };
  }

  const controller = new AbortController();
  token.onCancellationRequested(() => controller.abort());
  activeToken = token;
  activeSignal = controller.signal;

  const session = sessionFor(request, config.model);
  session.memory.incrementTurn();
  session.store.addMessage("user", request.prompt, command);

  const renderState = newRenderState();
  const sink = {
    markdown: (value: string) => stream.markdown(value),
    progress: (value: string) => stream.progress(value),
    button: (cmd: { command: string; title: string }) => stream.button(cmd),
  };

  let lastErrorAction: { command: string; title: string } | undefined;
  let responseText = "";
  const onEvent = (event: AgentEvent) => {
    if (event.type === "error") {
      lastErrorAction = errorAction(event.error);
      session.memory.incrementErrors();
    }
    if (event.type === "text-delta") responseText += event.text;
    if (event.type === "rate-limit" && event.remaining !== undefined) {
      updateRateLimitStatus(event.remaining);
    }
    renderEvent(event, sink, renderState, config.reasoning.show);
  };
  activeOnEvent = onEvent;

  const finishTurn = (mode: string) => {
    session.store.addMessage("assistant", responseText, mode);
    session.memory.persist();
    activeToken = undefined;
    activeOnEvent = undefined;
    activeSignal = undefined;
    return { metadata: { mode } };
  };

  const skillBlock = buildSkillBlock(request.prompt, command, session);

  if (command === "skills") {
    stream.markdown(renderSkills());
    return { metadata: { mode: "help" } };
  }

  if (command === "plan") {
    const result = await runPlanMode({
      request,
      stream,
      token,
      onEvent,
      log: (m) => log.info(m),
      config,
      controller,
      registry,
      gate,
      session,
      skillBlock,
    });
    if (lastErrorAction) stream.button(lastErrorAction);
    return result;
  }

  if (command === "debug") {
    await runDebugMode({
      request,
      stream,
      token,
      onEvent,
      log: (message) => log.info(message),
      config,
      controller,
      registry,
      gate,
      session,
      skillBlock,
    });
    if (lastErrorAction) stream.button(lastErrorAction);
    return finishTurn("debug");
  }

  if (command === "agent") {
    await runAgentMode({
      request,
      stream,
      token,
      onEvent,
      log: (message) => log.info(message),
      config,
      controller,
      registry,
      gate,
      session,
      skillBlock,
    });
    if (lastErrorAction) stream.button(lastErrorAction);
    return finishTurn("agent");
  }

  const activeEditor = vscode.window.activeTextEditor;
  const assembled = await assembleContext({
    references: request.references,
    activeEditor,
    contextWindow: 200_000,
    truncateKB: config.tools.truncateKB,
  });

  if (assembled.includedLabels.length > 0) {
    stream.progress(`Context: ${assembled.includedLabels.join(", ")}`);
  }

  const history = context.history
    .slice(-6)
    .map((turn) => {
      if (turn instanceof vscode.ChatRequestTurn) return `User: ${turn.prompt}`;
      if (turn instanceof vscode.ChatResponseTurn) {
        const text = turn.response
          .map((part) => (part instanceof vscode.ChatResponseMarkdownPart ? part.value.value : ""))
          .join("");
        return `Assistant: ${text.slice(0, 500)}`;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");

  const prompt = buildPrompt(request.prompt, assembled.text, history, skillBlock);
  stream.progress(`Thinking with ${config.model}…`);
  await runAsk({ config, prompt, signal: controller.signal, onEvent });

  if (lastErrorAction) stream.button(lastErrorAction);
  return finishTurn("ask");
};

function buildSkillBlock(prompt: string, mode: string, session: ChatSession): string {
  if (!skillEngine) return "";
  const activeEditor = vscode.window.activeTextEditor;
  const matches = skillEngine.match({
    prompt,
    mode,
    activeFile: activeEditor ? vscode.workspace.asRelativePath(activeEditor.document.uri) : undefined,
    recentFiles: session.memory.current.lastFilesChanged,
    memoryNotes: session.memory.current.notes,
    knowledgeTitles: session.store
      .recentMessages(5)
      .map((m) => m.content.slice(0, 80)),
  });

  if (matches.length === 0) return "";

  for (const m of matches) {
    session.store.addKnowledge(
      `skill-used:${m.skill.slug}`,
      `Applied in ${mode} mode (score ${m.score}: ${m.reasons.join(", ")})`,
      [m.skill.slug, mode],
      "session",
    );
    skillEngine.recordUse(m.skill.slug, session.store.sessionId, m.score);
  }

  return matches
    .map((m) => {
      const header = [
        `<skill name="${m.skill.name}">`,
        `Objective: ${m.skill.objective}`,
        m.skill.goals.length > 0 ? `Goals:\n${m.skill.goals.map((g) => `- ${g}`).join("\n")}` : "",
        "",
      ]
        .filter(Boolean)
        .join("\n");
      return `${header}${m.skill.content}\n</skill>`;
    })
    .join("\n\n");
}

interface PlanModeArgs {
  request: vscode.ChatRequest;
  stream: vscode.ChatResponseStream;
  token: vscode.CancellationToken;
  onEvent: (event: AgentEvent) => void;
  log: (message: string) => void;
  config: ReturnType<typeof loadConfig>;
  controller: AbortController;
  registry: ToolRegistry | undefined;
  gate: ApprovalGate | undefined;
  session: ChatSession;
  skillBlock: string;
}

async function runPlanMode(args: PlanModeArgs): Promise<vscode.ChatResult> {
  const { request, stream, token, onEvent, config, controller, registry, gate, log, session, skillBlock } = args;

  const prompt = request.prompt.trim();

  if (/^execute\b/i.test(prompt)) {
    const slugArg = prompt.replace(/^execute\b/i, "").trim();
    return executePlan({
      slugArg,
      stream,
      token,
      onEvent,
      config,
      controller,
      registry,
      gate,
      log,
      session,
      skillBlock,
    });
  }

  if (!prompt || /^list$/i.test(prompt)) {
    const plans = session.store.listPlans();
    if (plans.length === 0) {
      stream.markdown("No plans yet in this session. Create one with `/plan <your goal>`.");
      return { metadata: { mode: "help" } };
    }
    stream.markdown(
      [
        "**Plans in this session** _(stored in ~/.cutad/cutad.db)_:",
        "",
        ...plans.map((p) => {
          const artifact = JSON.parse(p.artifactJson) as PlanArtifact;
          const { done, total } = planProgress(artifact);
          return `- \`${p.slug}\` — ${p.title} (${p.status}, ${done}/${total} steps)`;
        }),
        "",
        "Execute one with `/plan execute <slug>`.",
      ].join("\n"),
    );
    return { metadata: { mode: "help" } };
  }

  stream.progress("Generating plan…");
  const contextInfo = await assembleContext({
    references: request.references,
    activeEditor: vscode.window.activeTextEditor,
    contextWindow: 200_000,
    truncateKB: config.tools.truncateKB,
  });

  const generated = await generatePlan({
    config,
    goal: prompt,
    contextText: [skillBlock, contextInfo.text].filter(Boolean).join("\n\n"),
    signal: controller.signal,
  });

  if (generated.error || !generated.plan) {
    stream.markdown(`**Plan generation failed:** ${generated.error?.detail ?? "unknown error"}`);
    return { metadata: { mode: "help" } };
  }

  const plan = generated.plan;
  persistPlan(session, plan);
  log(`[plan] saved ${plan.slug} to session db`);

  stream.markdown(renderPlanMarkdown(plan));
  stream.markdown(`\n\n_Saved to session database (~/.cutad/cutad.db)_`);
  stream.markdown(
    "\n\nRun **`/plan execute " + plan.slug + "`** to start executing with step-by-step approval.",
  );
  return { metadata: { mode: "plan-created", slug: plan.slug } };
}

function persistPlan(session: ChatSession, plan: PlanArtifact): void {
  session.store.savePlan(plan.slug, plan.title, plan.goal, plan.status, JSON.stringify(plan));
  session.memory.setActivePlan({
    slug: plan.slug,
    status: plan.status,
    cursor: plan.steps.filter((s) => s.status === "done" || s.status === "skipped").length,
    total: plan.steps.length,
  });
}

interface ExecutePlanArgs {
  slugArg: string;
  stream: vscode.ChatResponseStream;
  token: vscode.CancellationToken;
  onEvent: (event: AgentEvent) => void;
  config: ReturnType<typeof loadConfig>;
  controller: AbortController;
  registry: ToolRegistry | undefined;
  gate: ApprovalGate | undefined;
  log: (message: string) => void;
  session: ChatSession;
  skillBlock: string;
}

async function executePlan(args: ExecutePlanArgs): Promise<vscode.ChatResult> {
  const { slugArg, stream, token, onEvent, config, controller, registry, gate, log, session, skillBlock } = args;

  if (!registry || !gate) {
    stream.markdown("**Planning unavailable:** registry not initialized.");
    return { metadata: { mode: "help" } };
  }

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    stream.markdown("**Plan execution needs an open workspace folder.**");
    return { metadata: { mode: "help" } };
  }

  let plan: PlanArtifact;
  if (slugArg) {
    const record = session.store.getPlan(slugArg);
    if (!record) {
      stream.markdown(`Plan \`${slugArg}\` not found in this session. Use \`/plan list\`.`);
      return { metadata: { mode: "help" } };
    }
    plan = JSON.parse(record.artifactJson) as PlanArtifact;
  } else {
    const records = session.store.listPlans();
    if (records.length === 0) {
      stream.markdown("No plans found. Create one with `/plan <goal>`.");
      return { metadata: { mode: "help" } };
    }
    const picked = await vscode.window.showQuickPick(
      records.map((p) => ({
        label: p.slug,
        description: `${p.status} · updated ${p.updatedAt.slice(0, 16)}`,
        detail: p.title,
        record: p,
      })),
      { title: "Cutad.AI — Execute which plan?" },
    );
    if (!picked) return { metadata: { mode: "help" } };
    plan = JSON.parse(picked.record.artifactJson) as PlanArtifact;
  }

  if (plan.steps.length === 0) {
    stream.markdown(`Plan \`${plan.slug}\` has no steps.`);
    return { metadata: { mode: "help" } };
  }

  plan = { ...plan, status: "in-progress" };
  persistPlan(session, plan);

  const threadId = `plan-${session.store.sessionId}-${plan.slug}`;
  let graph = planGraphs.get(threadId);
  if (!graph) {
    graph = buildPlanExecGraph({
      executeStep: async (step) =>
        executeStepWithAgent({
          step,
          config,
          registry: registry!,
          gate: gate!,
          controller,
          token,
          workspaceRoot,
          onEvent,
          session,
          skillBlock,
        }),
      persist: async (updated) => {
        persistPlan(session, updated);
      },
      onProgress: (message) => {
        log(`[plan] ${message}`);
        stream.progress(message);
      },
    });
    planGraphs.set(threadId, graph);
  }

  const state = await graph.getState({ configurable: { thread_id: threadId } });
  const hasCheckpoint = Boolean((state.values as { plan?: PlanArtifact }).plan);
  const starting = hasCheckpoint ? new Command({ resume: "approve" }) : { plan };

  stream.markdown(`**Executing plan: ${plan.title}** (${plan.steps.length} steps)\n`);

  let outcome = await runPlanGraph(graph, threadId, starting as never);
  let guard = 0;

  while (!outcome.finished && outcome.pendingApproval && guard++ < 50) {
    const approval = outcome.pendingApproval;
    stream.markdown(
      [
        "",
        `### Step ${approval.stepIndex}: ${approval.stepTitle}${approval.isRetry ? " _(retry)_" : ""}`,
        "",
        approval.objective,
        approval.files.length ? `\n**Files:** ${approval.files.map((f) => `\`${f}\``).join(", ")}` : "",
        approval.verify ? `\n**Verify:** \`${approval.verify}\`` : "",
      ].join("\n"),
    );

    const decision = await askStepDecision(approval);
    if (token.isCancellationRequested) {
      stream.markdown("\n\n_(plan execution canceled)_");
      break;
    }

    outcome = await runPlanGraph(graph, threadId, new Command({ resume: decision }));
  }

  if (outcome.finished) {
    const { done, total } = planProgress(outcome.plan);
    stream.markdown(
      [
        "",
        "---",
        `**Plan finished** — status: ${outcome.plan.status} · ${done}/${total} steps done`,
        "",
        outcome.plan.steps.map((s) => `- ${statusIcon(s.status)} ${s.index}. ${s.title}`).join("\n"),
      ].join("\n"),
    );
  }

  return { metadata: { mode: "plan-executed", slug: plan.slug } };
}

async function askStepDecision(approval: StepApprovalRequest): Promise<StepDecision> {
  const items: Array<vscode.QuickPickItem & { decision: StepDecision }> = [
    { label: "$(check) Approve this step", decision: "approve" },
    { label: "$(check-all) Approve all remaining", decision: "approve-all" },
    { label: "$(debug-step-over) Skip this step", decision: "skip" },
    { label: "$(x) Abort plan", decision: "abort" },
  ];
  const picked = await vscode.window.showQuickPick(items, {
    title: `Cutad.AI — Step ${approval.stepIndex}: ${approval.stepTitle}`,
    placeHolder: approval.objective.slice(0, 120),
    ignoreFocusOut: true,
  });
  return picked?.decision ?? "abort";
}

interface ExecuteStepArgs {
  step: { index: number; title: string; objective: string; files: string[]; verify?: string };
  config: ReturnType<typeof loadConfig>;
  registry: ToolRegistry;
  gate: ApprovalGate;
  controller: AbortController;
  token: vscode.CancellationToken;
  workspaceRoot: string;
  onEvent: (event: AgentEvent) => void;
  session: ChatSession;
  skillBlock: string;
}

async function executeStepWithAgent(args: ExecuteStepArgs): Promise<{ ok: boolean; summary: string }> {
  const { step, config, registry, gate, controller, token, workspaceRoot, onEvent, session, skillBlock } = args;
  const prompt = [
    skillBlock,
    `You are executing step ${step.index} of a plan: "${step.title}".`,
    `Objective: ${step.objective}`,
    step.files.length ? `Expected files: ${step.files.join(", ")}` : "",
    step.verify ? `After changes, run this verification command: ${step.verify}` : "",
    "Complete only this step. Report what you changed and the verification result.",
  ]
    .filter(Boolean)
    .join("\n");

  const result = await runAgent({
    config,
    prompt,
    registry,
    signal: controller.signal,
    token,
    workspaceRoot,
    approve: async (req) => {
      const spec = registry.get(req.toolId);
      if (!spec) return "deny";
      return gate.request(spec, approvalRequestFor(spec, req.summary, req.detail));
    },
    onEvent: (event) => {
      recordToolEvent(session, event);
      onEvent(event);
    },
    log: () => undefined,
    maxIterations: config.agent.maxIterations,
  });

  session.memory.incrementToolCalls(result.toolCalls);
  session.memory.incrementDenials(result.denied);
  session.memory.recordFilesChanged(result.filesChanged);

  const ok = result.denied === 0 && result.toolCalls > 0;
  return {
    ok,
    summary: `${result.toolCalls} tool calls, files: ${result.filesChanged.join(", ") || "none"}`,
  };
}

function recordToolEvent(session: ChatSession, event: AgentEvent): void {
  if (event.type === "tool-end") {
    session.store.addToolUsage(event.toolId, event.preview.slice(0, 120), event.ok, !event.ok);
  }
}

function scheduleSkillLearning(params: {
  config: ReturnType<typeof loadConfig>;
  session: ChatSession;
  mode: string;
  userRequest: string;
  outcomeSummary: string;
  toolsUsed: string[];
  filesChanged: string[];
  signal: AbortSignal;
}): void {
  if (!skillEngine) return;
  if (params.toolsUsed.length === 0 && params.filesChanged.length === 0) return;

  const engine = skillEngine;
  void maybeLearnSkill({
    config: params.config,
    skillEngine: engine,
    sessionId: params.session.store.sessionId,
    mode: params.mode,
    userRequest: params.userRequest,
    outcomeSummary: params.outcomeSummary,
    toolsUsed: params.toolsUsed,
    filesChanged: params.filesChanged,
    existingSkillSlugs: engine.list().map((s) => s.slug),
    signal: params.signal,
  }).then((result) => {
    if (result.learned) {
      getLogger().info(`[skills] learned new skill "${result.slug}" from ${params.mode} session`);
    }
  });
}

function renderPlanMarkdown(plan: PlanArtifact): string {
  return [
    `## Plan: ${plan.title}`,
    "",
    plan.goal,
    "",
    ...plan.steps.map(
      (s) =>
        `- [ ] **${s.index}. ${s.title}**\n  ${s.objective}${s.files.length ? `\n  Files: ${s.files.map((f) => `\`${f}\``).join(", ")}` : ""}${s.verify ? `\n  Verify: \`${s.verify}\`` : ""}`,
    ),
  ].join("\n");
}

function statusIcon(status: string): string {
  switch (status) {
    case "done":
      return "✅";
    case "skipped":
      return "⏭️";
    case "failed":
      return "❌";
    case "in-progress":
      return "🔄";
    default:
      return "⬜";
  }
}

interface AgentModeArgs {
  request: vscode.ChatRequest;
  stream: vscode.ChatResponseStream;
  token: vscode.CancellationToken;
  onEvent: (event: AgentEvent) => void;
  log: (message: string) => void;
  config: ReturnType<typeof loadConfig>;
  controller: AbortController;
  registry: ToolRegistry | undefined;
  gate: ApprovalGate | undefined;
  session: ChatSession;
  skillBlock: string;
}

async function runDebugMode(args: AgentModeArgs): Promise<void> {
  const { request, stream, token, onEvent, log, config, controller, registry, gate, session, skillBlock } = args;
  if (!registry || !gate) {
    stream.markdown("**Debug unavailable:** tool registry not initialized.");
    return;
  }

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    stream.markdown("**Debug mode needs an open workspace folder.**");
    return;
  }

  const debugState = describeDebugEnvironment();
  stream.progress(debugState.summary);

  const contextInfo = await assembleContext({
    references: request.references,
    activeEditor: vscode.window.activeTextEditor,
    contextWindow: 200_000,
    truncateKB: config.tools.truncateKB,
  });

  const prompt = [
    skillBlock,
    `<debug_request>\n${request.prompt}\n</debug_request>`,
    `<debug_environment>\n${debugState.details}\n</debug_environment>`,
    contextInfo.text ? `<workspace_context>\n${contextInfo.text}\n</workspace_context>` : "",
    `Workspace root: ${workspaceRoot}`,
    "Investigate the failure using real runtime evidence:",
    "1. If tests are failing, use run_tests to reproduce and read the failure output.",
    "2. If a debug session is stopped, use get_debug_state to read the actual stack and variables — do not guess.",
    "3. If reproduction needs a breakpoint, use set_breakpoint then launch_debug (both require user approval).",
    "4. For unfamiliar areas, delegate exploration to the explorer specialist before forming hypotheses.",
    "5. State the root cause with file:line references, then propose a fix with apply_patch.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const result = await runAgent({
    config,
    prompt,
    registry,
    signal: controller.signal,
    token,
    workspaceRoot,
    approve: async (req) => {
      const spec = registry.get(req.toolId);
      if (!spec) return "deny";
      return gate.request(spec, approvalRequestFor(spec, req.summary, req.detail));
    },
    onEvent: (event) => {
      recordToolEvent(session, event);
      onEvent(event);
    },
    log,
    maxIterations: config.agent.maxIterations,
  });

  session.memory.incrementToolCalls(result.toolCalls);
  session.memory.incrementDenials(result.denied);
  session.memory.recordFilesChanged(result.filesChanged);

  const summary: string[] = ["", "---", "**Debug run complete**"];
  summary.push(`- Tool calls: ${result.toolCalls}${result.denied > 0 ? ` (${result.denied} denied)` : ""}`);
  summary.push(
    result.filesChanged.length > 0
      ? `- Files changed: ${result.filesChanged.join(", ")}`
      : "- Files changed: none",
  );
  stream.markdown(summary.join("\n"));
}

function describeDebugEnvironment(): { summary: string; details: string } {
  const session = vscode.debug.activeDebugSession;
  const breakpoints = vscode.debug.breakpoints;
  const parts: string[] = [];

  if (session) {
    parts.push(`Active debug session: ${session.name} (type: ${session.type})`);
  } else {
    parts.push("No active debug session.");
  }
  parts.push(`${breakpoints.length} breakpoint(s) set.`);

  const folders = vscode.workspace.workspaceFolders;
  const hasLaunchJson = folders && folders.length > 0;
  parts.push(hasLaunchJson ? "Launch configs may exist in .vscode/launch.json." : "No workspace folder.");

  return {
    summary: session ? `Debug session active: ${session.name}` : "No active debug session — will reproduce via tests",
    details: parts.join("\n"),
  };
}

async function runAgentMode(args: AgentModeArgs): Promise<void> {
  const { request, stream, token, onEvent, log, config, controller, registry, gate, session, skillBlock } = args;
  if (!registry || !gate) {
    stream.markdown("**Agent unavailable:** tool registry not initialized.");
    return;
  }

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    stream.markdown("**Agent mode needs an open workspace folder.**");
    return;
  }

  const contextInfo = await assembleContext({
    references: request.references,
    activeEditor: vscode.window.activeTextEditor,
    contextWindow: 200_000,
    truncateKB: config.tools.truncateKB,
  });

  const prompt = [
    skillBlock,
    `<user_request>\n${request.prompt}\n</user_request>`,
    contextInfo.text ? `<workspace_context>\n${contextInfo.text}\n</workspace_context>` : "",
    `Workspace root: ${workspaceRoot}`,
    `Session scratch dir (use for temporary files): ${session.temp.root}`,
    "For unfamiliar areas, delegate to the explorer specialist first. For verification, delegate to the tester specialist.",
  ]
    .filter(Boolean)
    .join("\n\n");

  stream.progress(`Agent starting with ${registry.all().length} tools (${config.model})…`);

  const toolsUsed: string[] = [];
  let responseTextFromEvents = "";

  const result = await runAgent({
    config,
    prompt,
    registry,
    signal: controller.signal,
    token,
    workspaceRoot,
    approve: async (req) => {
      const spec = registry.get(req.toolId);
      if (!spec) return "deny";
      return gate.request(spec, approvalRequestFor(spec, req.summary, req.detail));
    },
    onEvent: (event) => {
      if (event.type === "tool-start") toolsUsed.push(event.toolId);
      if (event.type === "text-delta") responseTextFromEvents += event.text;
      recordToolEvent(session, event);
      onEvent(event);
    },
    log,
    maxIterations: config.agent.maxIterations,
  });

  session.memory.incrementToolCalls(result.toolCalls);
  session.memory.incrementDenials(result.denied);
  session.memory.recordFilesChanged(result.filesChanged);

  scheduleSkillLearning({
    config,
    session,
    mode: "agent",
    userRequest: request.prompt,
    outcomeSummary: responseTextFromEvents,
    toolsUsed: [...new Set(toolsUsed)],
    filesChanged: result.filesChanged,
    signal: controller.signal,
  });

  const summary: string[] = ["", "---", "**Agent run complete**"];
  summary.push(`- Tool calls: ${result.toolCalls}${result.denied > 0 ? ` (${result.denied} denied)` : ""}`);
  summary.push(
    result.filesChanged.length > 0
      ? `- Files changed: ${result.filesChanged.join(", ")}`
      : "- Files changed: none",
  );
  stream.markdown(summary.join("\n"));
}

function buildPrompt(userPrompt: string, contextText: string, history: string, skillBlock = ""): string {
  const parts = [
    "You are Cutad.AI, a coding assistant inside VS Code. Answer concisely with markdown. Use code blocks with language tags.",
    "When relevant skills are provided, follow their playbooks. Use the delegate_to_specialist tool for focused sub-investigations.",
  ];
  if (skillBlock) parts.push(skillBlock);
  if (history) parts.push(`<conversation_history>\n${history}\n</conversation_history>`);
  if (contextText) parts.push(`<workspace_context>\n${contextText}\n</workspace_context>`);
  parts.push(`<user_request>\n${userPrompt}\n</user_request>`);
  return parts.join("\n\n");
}

function modeNotice(command: string): string | undefined {
  return undefined;
}

function renderSkills(): string {
  if (!skillEngine) return "Skill engine not initialized.";
  const skills = skillEngine.list();
  const usage = new Map(skillEngine.usageStats().map((u) => [u.slug, u.uses]));
  if (skills.length === 0) {
    return "No skills installed. Builtin skills seed to `~/.cutad/skills/` on first run — reload the window.";
  }
  const lines: string[] = [
    `**Skills** (${skills.length}) — markdown files in \`~/.cutad/skills/\` _(home-basedir)_`,
    "",
    "| Slug | Name | Goals | Triggers | Uses |",
    "|---|---|---|---|---|",
    ...skills.map(
      (s) =>
        `| \`${s.slug}\` | ${s.name} | ${s.goals.length} | ${s.triggers.slice(0, 3).join(", ") || "—"} | ${usage.get(s.slug) ?? 0} |`,
    ),
    "",
    "**Objectives of the most-used skills:**",
    "",
    ...skills
      .slice()
      .sort((a, b) => (usage.get(b.slug) ?? 0) - (usage.get(a.slug) ?? 0))
      .slice(0, 5)
      .map((s) => `- **${s.name}** — ${s.objective || s.description}`),
    "",
    "Skills auto-match by trigger keywords and inject their objective + goals + playbook into the agent context.",
    "The agent can create new skills via the `create_skill` tool — they appear here immediately.",
  ];
  return lines.join("\n");
}

function helpMarkdown(model: string, toolCount: number): string {
  return [
    `**Cutad.AI** — active model: \`${model}\` · ${toolCount} tools registered`,
    "",
    "| Command | Status |",
    "|---|---|",
    "| `/ask` | ✅ available (default) |",
    "| `/agent` | ✅ available — coding agent with tools + approvals |",
    "| `/plan <goal>` | ✅ available — generate a durable plan |",
    "| `/plan execute [slug]` | ✅ available — execute with step approvals |",
    "| `/plan list` | ✅ list saved plans |",
    "| `/debug <problem>` | ✅ available — debugger & test investigation |",
    "| `/skills` | ✅ list installed skills |",
    "| `/help` | ✅ this message |",
    "",
    `Config: \`${configPath()}\` · Storage: \`~/.cutad/\` (SQLite + sessions + skills)`,
  ].join("\n");
}

let rateLimitItem: vscode.StatusBarItem | undefined;

function updateRateLimitStatus(remaining: number): void {
  if (!rateLimitItem) {
    rateLimitItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
    rateLimitItem.command = "cutad.showDiagnostics";
    rateLimitItem.tooltip = "CutadAI remaining requests in current window";
  }
  rateLimitItem.text = `$(pulse) CutadAI ${remaining}`;
  rateLimitItem.show();
}
