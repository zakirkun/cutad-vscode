import * as vscode from "vscode";
import { loadConfig, configPath } from "../config/homeConfig";
import { createProvider } from "../llm/gateway";
import { getLogger } from "../util/logger";
import { streamText } from "ai";

export const PARTICIPANT_ID = "cutad.chat";

/**
 * Phase 0 participant — now wired to the real CutadAI gateway via the Vercel AI SDK.
 * Full mode routing (`/ask`, `/agent`, `/plan`, `/debug`) arrives in Phases 1–4.
 */
export function registerPlaceholderParticipant(context: vscode.ExtensionContext): void {
  const participant = vscode.chat.createChatParticipant(PARTICIPANT_ID, handler);
  context.subscriptions.push(participant);
  getLogger().info(`[chat] participant registered: @${PARTICIPANT_ID}`);
}

const handler: vscode.ChatRequestHandler = async (
  request,
  _context,
  stream,
  token,
): Promise<vscode.ChatResult> => {
  const log = getLogger();
  const config = loadConfig();
  log.info(`[chat] command=${request.command ?? "(none)"} model=${config.model}`);

  if (!config.apiKey) {
    stream.markdown(
      `No API key configured.\n\nEdit \`${configPath()}\` or run **Cutad.AI: Set API Key**.`,
    );
    return {};
  }

  if (request.command === "help") {
    stream.markdown(helpMarkdown(config.model));
    return {};
  }

  stream.progress(`Thinking with ${config.model}…`);

  const provider = createProvider(config);
  const result = streamText({
    model: provider.chatModel(config.model),
    prompt: request.prompt,
    maxOutputTokens: 4096,
    abortSignal: abortFromToken(token),
  });

  try {
    for await (const part of result.stream) {
      if (token.isCancellationRequested) break;
      if (part.type === "text-delta") {
        stream.markdown(part.text);
      } else if (part.type === "reasoning-delta") {
        if (config.reasoning.show) stream.markdown(`> _${part.text}_\n\n`);
      } else if (part.type === "error") {
        throw part.error;
      }
    }
  } catch (err) {
    log.error(`[chat] stream failed: ${String(err)}`);
    stream.markdown(`\n\n**Gateway error:** ${formatError(err)}`);
  }

  return {};
};

function abortFromToken(token: vscode.CancellationToken): AbortSignal {
  const controller = new AbortController();
  token.onCancellationRequested(() => controller.abort());
  return controller.signal;
}

function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function helpMarkdown(model: string): string {
  return [
    `**Cutad.AI** — active model: \`${model}\``,
    "",
    "| Command | Status |",
    "|---|---|",
    "| `/ask` | Phase 1 |",
    "| `/agent` | Phase 2 |",
    "| `/plan` | Phase 3 |",
    "| `/debug` | Phase 4 |",
    "",
    `Config: \`${configPath()}\``,
  ].join("\n");
}

