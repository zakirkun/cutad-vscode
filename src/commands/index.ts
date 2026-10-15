import * as vscode from "vscode";
import * as fs from "node:fs/promises";
import * as path from "node:path";
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
    vscode.commands.registerCommand("cutad.selectModel", async () => {
      const config = loadConfig();
      if (!config.apiKey) {
        void vscode.window.showWarningMessage(`Cutad.AI: no API key. Edit ${configPath()}.`);
        return;
      }
      try {
        const models = await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: "Cutad.AI: fetching models…" },
          () => listModels(config),
        );
        if (models.length === 0) {
          void vscode.window.showWarningMessage("Cutad.AI: no models available for this key.");
          return;
        }
        const picked = await vscode.window.showQuickPick(
          models.map((m) => ({
            label: m.id === config.model ? `$(check) ${m.id}` : m.id,
            description: `${Math.round(m.contextWindow / 1000)}k ctx · ${Math.round(m.maxOutputTokens / 1000)}k out${m.reasoning ? " · reasoning" : ""}`,
            detail: m.displayName,
            id: m.id,
          })),
          { title: "Cutad.AI — Select Model", placeHolder: `Current: ${config.model}` },
        );
        if (!picked) return;
        saveConfig({ model: picked.id });
        getLogger().info(`[config] model set to ${picked.id}`);
        void vscode.window.showInformationMessage(`Cutad.AI: model set to ${picked.id}`);
      } catch (err) {
        getLogger().error(`[config] selectModel failed: ${String(err)}`);
        void vscode.window.showErrorMessage(`Cutad.AI: could not list models — ${String(err)}`);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("cutad.openConfig", async () => {
      ensureConfigFile();
      const doc = await vscode.workspace.openTextDocument(configPath());
      await vscode.window.showTextDocument(doc);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("cutad.openPlan", async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        void vscode.window.showWarningMessage("Cutad.AI: no workspace folder open.");
        return;
      }
      const base = path.resolve(workspaceRoot, ".cutad", "plans");
      let files: string[];
      try {
        files = (await fs.readdir(base)).filter((f) => f.endsWith(".md"));
      } catch {
        void vscode.window.showWarningMessage("Cutad.AI: no plans found in .cutad/plans.");
        return;
      }
      if (files.length === 0) {
        void vscode.window.showWarningMessage("Cutad.AI: no plans found in .cutad/plans.");
        return;
      }
      const picked = await vscode.window.showQuickPick(files, { title: "Cutad.AI — Open Plan" });
      if (!picked) return;
      const doc = await vscode.workspace.openTextDocument(path.join(base, picked));
      await vscode.window.showTextDocument(doc);
    }),
  );
}
