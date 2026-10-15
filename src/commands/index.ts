import * as vscode from "vscode";
import { ensureConfigFile, configPath, loadConfig, saveConfig } from "../config/homeConfig";
import { listModels } from "../llm/gateway";
import { getLogger } from "../util/logger";

export function registerCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("cutad.setApiKey", async () => {
      ensureConfigFile();
      const key = await vscode.window.showInputBox({
        title: "Cutad.AI — API Key",
        prompt: `Paste your CutadAI API key (cag_…). Saved to ${configPath()}.`,
        password: true,
        ignoreFocusOut: true,
        value: "",
      });
      if (!key) return;
      saveConfig({ apiKey: key.trim() });
      getLogger().info(`[config] API key saved to ${configPath()}`);
      void vscode.window.showInformationMessage(`Cutad.AI: API key saved to ${configPath()}`);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("cutad.testConnection", async () => {
      const config = loadConfig();
      if (!config.apiKey) {
        void vscode.window.showWarningMessage(
          `Cutad.AI: no API key. Edit ${configPath()} or run “Cutad.AI: Set API Key”.`,
        );
        return;
      }
      try {
        const models = await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: "Cutad.AI: testing gateway…" },
          () => listModels(config),
        );
        const configured = models.some((m) => m.id === config.model);
        const detail = `${models.length} models available · configured model “${config.model}” ${configured ? "found" : "NOT FOUND"}`;
        getLogger().info(`[config] testConnection OK — ${detail}`);
        void vscode.window.showInformationMessage(`Cutad.AI: gateway OK — ${detail}`);
      } catch (err) {
        getLogger().error(`[config] testConnection failed: ${String(err)}`);
        void vscode.window.showErrorMessage(`Cutad.AI: gateway check failed — ${String(err)}`);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("cutad.showDiagnostics", () => {
      const log = getLogger();
      const config = loadConfig();
      log.info(
        `[diag] extension=${context.extension.id} vscode=${vscode.version} node=${process.version} config=${configPath()} model=${config.model} key=${config.apiKey ? "present" : "missing"}`,
      );
      log.show(true);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("cutad.openConfig", async () => {
      ensureConfigFile();
      const doc = await vscode.workspace.openTextDocument(configPath());
      await vscode.window.showTextDocument(doc);
    }),
  );
}
