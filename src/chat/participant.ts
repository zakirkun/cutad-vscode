import * as vscode from "vscode";
import { loadConfig, configPath } from "../config/homeConfig";
import { runAsk, type AgentEvent } from "../llm/runtime";
import { assembleContext } from "../context/assembler";
import { newRenderState, renderEvent, errorAction } from "./render";
import { getLogger } from "../util/logger";

export const PARTICIPANT_ID = "cutad.chat";

export function registerParticipant(context: vscode.ExtensionContext): void {
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
  getLogger().info(`[chat] participant registered: @${PARTICIPANT_ID}`);
}

const handler: vscode.ChatRequestHandler = async (
  request,
  context,
  stream,
  token,
): Promise<vscode.ChatResult> => {
  const log = getLogger();
  const config = loadConfig();
  log.info(`[chat] command=${request.command ?? "(none)"} model=${config.model}`);

  if (!config.apiKey) {
    stream.markdown(
      `**No API key configured.**\n\nAdd your key to \`${configPath()}\` or run **Cutad.AI: Set API Key**.`,
    );
    return { metadata: { mode: "help" } };
  }

  if (request.command === "help") {
    stream.markdown(helpMarkdown(config.model));
    return { metadata: { mode: "help" } };
  }

  const notice = modeNotice(request.command);
  if (notice) {
    stream.markdown(notice);
    return { metadata: { mode: "help" } };
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

  const controller = new AbortController();
  token.onCancellationRequested(() => controller.abort());

  const renderState = newRenderState();
  const sink = {
    markdown: (value: string) => stream.markdown(value),
    progress: (value: string) => stream.progress(value),
    button: (command: { command: string; title: string }) => stream.button(command),
  };

  let lastErrorAction: { command: string; title: string } | undefined;

  const onEvent = (event: AgentEvent) => {
    if (event.type === "error") lastErrorAction = errorAction(event.error);
    if (event.type === "rate-limit" && event.remaining !== undefined) {
      updateRateLimitStatus(event.remaining);
    }
    renderEvent(event, sink, renderState, config.reasoning.show);
  };

  stream.progress(`Thinking with ${config.model}…`);
  await runAsk({ config, prompt, signal: controller.signal, onEvent });

  if (lastErrorAction) {
    stream.button(lastErrorAction);
  }

  return { metadata: { mode: request.command ?? "ask" } };
};

function buildPrompt(userPrompt: string, contextText: string, history: string): string {
  const parts = [
    "You are Cutad.AI, a coding assistant inside VS Code. Answer concisely with markdown. Use code blocks with language tags.",
  ];
  if (history) parts.push(`<conversation_history>\n${history}\n</conversation_history>`);
  if (contextText) parts.push(`<workspace_context>\n${contextText}\n</workspace_context>`);
  parts.push(`<user_request>\n${userPrompt}\n</user_request>`);
  return parts.join("\n\n");
}

function modeNotice(command: string | undefined): string | undefined {
  switch (command) {
    case "agent":
      return "**`/agent` arrives in Phase 2** — coding agent with tools and approvals. Use plain messages or `/ask` for now.";
    case "plan":
      return "**`/plan` arrives in Phase 3** — durable plan artifacts with step execution. Use plain messages or `/ask` for now.";
    case "debug":
      return "**`/debug` arrives in Phase 4** — debugger and test-state investigation. Use plain messages or `/ask` for now.";
    default:
      return undefined;
  }
}

function helpMarkdown(model: string): string {
  return [
    `**Cutad.AI** — active model: \`${model}\``,
    "",
    "| Command | Status |",
    "|---|---|",
    "| `/ask` | ✅ available (default) |",
    "| `/agent` | Phase 2 |",
    "| `/plan` | Phase 3 |",
    "| `/debug` | Phase 4 |",
    "| `/help` | ✅ this message |",
    "",
    `Config: \`${configPath()}\` · Commands: **Cutad.AI: Test Connection**, **Cutad.AI: Select Model**`,
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
