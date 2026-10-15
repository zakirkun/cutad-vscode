import * as vscode from "vscode";

let channel: vscode.LogOutputChannel | undefined;

/** Shared output channel for Cutad.AI (never log secrets or prompt content at default level). */
export function getLogger(): vscode.LogOutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel("Cutad.AI", { log: true });
  }
  return channel;
}

export function disposeLogger(): void {
  channel?.dispose();
  channel = undefined;
}
