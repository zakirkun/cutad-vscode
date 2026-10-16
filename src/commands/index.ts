import * as vscode from "vscode";
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
    vscode.commands.registerCommand("cutad.startMcpServer", async () => {
      const { getActiveSession, getRegistry, getGate } = await import("../chat/participant");
      const registry = getRegistry();
      const gate = getGate();
      if (!registry || !gate) {
        void vscode.window.showWarningMessage("Cutad.AI: extension not fully initialized.");
        return;
      }

      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      const mode = await vscode.window.showQuickPick(
        [
          {
            label: "$(shield) In-editor server (recommended)",
            detail: "Localhost HTTP endpoint. Mutating tools prompt you in VS Code before running.",
            value: "in-editor" as const,
          },
          {
            label: "$(warning) Standalone terminal server (auto-approves)",
            detail: "Spawns dist/mcp-server.js in a terminal. NO approval prompts — trusted workspaces only.",
            value: "terminal" as const,
          },
        ],
        { title: "Cutad.AI — Start MCP Server", ignoreFocusOut: true },
      );
      if (!mode) return;

      if (mode.value === "terminal") {
        const session = getActiveSession();
        const terminal = vscode.window.createTerminal({
          name: "Cutad.AI MCP Server (auto-approve)",
          cwd: workspaceRoot ?? session?.temp.root,
          hideFromUser: false,
        });
        const serverPath = path.join(context.extensionPath, "dist", "mcp-server.js");
        const args = workspaceRoot ? ` --workspace "${workspaceRoot}"` : "";
        terminal.sendText(`node "${serverPath}"${args}`, true);
        terminal.show();
        void vscode.window.showWarningMessage(
          "Cutad.AI: standalone MCP server started — it AUTO-APPROVES all tool calls. Use only in trusted workspaces.",
        );
        getLogger().info(`[mcp] standalone server started: node ${serverPath}${args}`);
        return;
      }

      const { startInEditorMcpServer } = await import("../tools/inEditorMcp");
      const port = vscode.workspace.getConfiguration("cutad").get<number>("mcp.port") ?? 3987;
      const running = await startInEditorMcpServer({
        registry,
        workspaceRoot,
        approve: async (request) => {
          const spec = registry.get(request.toolId);
          if (!spec) return "deny";
          return gate.request(spec, request);
        },
        onLog: (message) => getLogger().info(message),
        port,
      });

      context.subscriptions.push({ dispose: () => void running.close() });
      void vscode.window.showInformationMessage(
        `Cutad.AI: in-editor MCP server running at ${running.url} — mutations prompt in VS Code.`,
      );
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("cutad.reconnectMcp", async () => {
      const { getMcpClient } = await import("../chat/participant");
      const client = getMcpClient();
      if (!client) {
        void vscode.window.showWarningMessage("Cutad.AI: MCP client not initialized.");
        return;
      }
      client.discoverConfigs();
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: "Cutad.AI: reconnecting MCP servers…" },
        () => client.connectAll(),
      );
      const states = client.list();
      void vscode.window.showInformationMessage(
        `Cutad.AI: ${states.filter((s) => s.status === "connected").length}/${states.length} MCP server(s) connected.`,
      );
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
      const { getActiveSession } = await import("../chat/participant");
      const session = getActiveSession();
      if (!session) {
        void vscode.window.showWarningMessage("Cutad.AI: no active session — send a message first.");
        return;
      }
      const plans = session.store.listPlans();
      if (plans.length === 0) {
        void vscode.window.showWarningMessage(
          "Cutad.AI: no plans in this session yet. Create one with `@cutad /plan <goal>`.",
        );
        return;
      }
      const picked = await vscode.window.showQuickPick(
        plans.map((p) => ({
          label: p.title || p.slug,
          description: `${p.status} · ${p.slug}`,
          detail: p.goal.slice(0, 120),
          slug: p.slug,
        })),
        { title: "Cutad.AI — Open Plan (from session database)" },
      );
      if (!picked) return;
      const doc = await vscode.workspace.openTextDocument({
        content: picked.detail ? `# ${picked.label}\n\n${picked.detail}` : picked.label,
        language: "markdown",
      });
      await vscode.window.showTextDocument(doc);
      void vscode.commands.executeCommand("workbench.action.chat.open", {
        query: `@cutad /plan execute ${picked.slug}`,
      });
    }),
  );
}
