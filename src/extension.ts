import * as vscode from "vscode";
import { registerPlaceholderParticipant } from "./chat/participant";
import { registerCommands } from "./commands";
import { disposeLogger, getLogger } from "./util/logger";

export function activate(context: vscode.ExtensionContext): void {
  const log = getLogger();
  log.info(`[activate] Cutad.AI activating — vscode=${vscode.version} node=${process.version}`);

  registerPlaceholderParticipant(context);
  registerCommands(context);

  // S-3 evidence: prove LangGraph + AI SDK load inside the real extension host.
  void runHostSpike(log);
}

async function runHostSpike(log: vscode.LogOutputChannel): Promise<void> {
  try {
    const { runSpike } = await import("./spikes/hostSmoke");
    const result = await runSpike();
    log.info(`[spike] S-3 host check: ${result}`);
  } catch (err) {
    log.error(`[spike] S-3 host check FAILED: ${String(err)}`);
  }
}

export function deactivate(): void {
  disposeLogger();
}
