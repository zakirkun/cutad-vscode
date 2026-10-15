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

export const PARTICIPANT_ID = "cutad.chat";

let registry: ToolRegistry | undefined;
let gate: ApprovalGate | undefined;

export function registerParticipant(context: vscode.ExtensionContext): void {
  registry = createDefaultRegistry();
  gate = new ApprovalGate(() => ({
    autoApprove: loadConfig().agent.autoApprove,
    trusted: vscode.workspace.isTrusted,
  }));

  registerLmTools(context, registry, gate);

  const participant = vscode.chat.createChatParticipant(PARTICIPANT_ID, handler);
  participant.followupProvider = {
    provideFollowups(result) {
      const mode = (result.metadata as { mode?: string } | undefined)?.mode;
      if (mode === "help") return [];
      return [
        { prompt: "Explain that in more detail", label: "Explain further" },
        { prompt: "Show a code example", label: "Show code example" },
        { prompt: "What should I do next?", label: "Next steps" },
      ];
    },
  };
  context.subscriptions.push(participant);
  getLogger().info(`[chat] participant registered: @${PARTICIPANT_ID} (${registry.all().length} tools)`);
}

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

  const renderState = newRenderState();
  const sink = {
    markdown: (value: string) => stream.markdown(value),
    progress: (value: string) => stream.progress(value),
    button: (cmd: { command: string; title: string }) => stream.button(cmd),
  };

  let lastErrorAction: { command: string; title: string } | undefined;
  const onEvent = (event: AgentEvent) => {
    if (event.type === "error") lastErrorAction = errorAction(event.error);
    if (event.type === "rate-limit" && event.remaining !== undefined) {
      updateRateLimitStatus(event.remaining);
    }
    renderEvent(event, sink, renderState, config.reasoning.show);
  };

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
    });
    if (lastErrorAction) stream.button(lastErrorAction);
    return { metadata: { mode: "agent" } };
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

  const prompt = buildPrompt(request.prompt, assembled.text, history);
  stream.progress(`Thinking with ${config.model}…`);
  await runAsk({ config, prompt, signal: controller.signal, onEvent });

  if (lastErrorAction) stream.button(lastErrorAction);
  return { metadata: { mode: "ask" } };
};

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
}

async function runAgentMode(args: AgentModeArgs): Promise<void> {
  const { request, stream, token, onEvent, log, config, controller, registry, gate } = args;
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
    `<user_request>\n${request.prompt}\n</user_request>`,
    contextInfo.text ? `<workspace_context>\n${contextInfo.text}\n</workspace_context>` : "",
    `Workspace root: ${workspaceRoot}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  stream.progress(`Agent starting with ${registry.all().length} tools (${config.model})…`);

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
    onEvent,
    log,
    maxIterations: config.agent.maxIterations,
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

function buildPrompt(userPrompt: string, contextText: string, history: string): string {
  const parts = [
    "You are Cutad.AI, a coding assistant inside VS Code. Answer concisely with markdown. Use code blocks with language tags.",
  ];
  if (history) parts.push(`<conversation_history>\n${history}\n</conversation_history>`);
  if (contextText) parts.push(`<workspace_context>\n${contextText}\n</workspace_context>`);
  parts.push(`<user_request>\n${userPrompt}\n</user_request>`);
  return parts.join("\n\n");
}

function modeNotice(command: string): string | undefined {
  switch (command) {
    case "plan":
      return "**`/plan` arrives in Phase 3** — durable plan artifacts with step execution. Use `/agent` or plain messages for now.";
    case "debug":
      return "**`/debug` arrives in Phase 4** — debugger and test-state investigation. Use `/agent` or plain messages for now.";
    default:
      return undefined;
  }
}

function helpMarkdown(model: string, toolCount: number): string {
  return [
    `**Cutad.AI** — active model: \`${model}\` · ${toolCount} tools registered`,
    "",
    "| Command | Status |",
    "|---|---|",
    "| `/ask` | ✅ available (default) |",
    "| `/agent` | ✅ available — coding agent with tools + approvals |",
    "| `/plan` | Phase 3 |",
    "| `/debug` | Phase 4 |",
    "| `/help` | ✅ this message |",
    "",
    `Config: \`${configPath()}\` · Commands: **Test Connection**, **Select Model**, **Open Config**`,
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
