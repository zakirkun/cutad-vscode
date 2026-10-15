import * as vscode from "vscode";
import { spawn } from "node:child_process";
import { z } from "zod";
import { ok, fail, type ToolSpec } from "../spec";
import { truncateText } from "../../context/budget";

export const getDiagnosticsTool: ToolSpec<{ path?: string; severity?: "error" | "warning" }> = {
  id: "get_diagnostics",
  displayName: "Get Diagnostics",
  description:
    "Get current errors and warnings from the language servers (Problems panel). Optionally filter by file path.",
  userDescription: "Read workspace diagnostics",
  readOnly: true,
  schema: z.object({
    path: z.string().optional().describe("Filter to a workspace-relative file path"),
    severity: z.enum(["error", "warning"]).optional().describe("Filter by severity"),
  }),
  async execute(input) {
    const lines: string[] = [];
    for (const [uri, diags] of vscode.languages.getDiagnostics()) {
      if (input.path && !vscode.workspace.asRelativePath(uri).includes(input.path)) continue;
      for (const d of diags) {
        const sev =
          d.severity === vscode.DiagnosticSeverity.Error
            ? "error"
            : d.severity === vscode.DiagnosticSeverity.Warning
              ? "warning"
              : d.severity === vscode.DiagnosticSeverity.Information
                ? "info"
                : "hint";
        if (input.severity && sev !== input.severity) continue;
        if (sev === "hint") continue;
        const rel = vscode.workspace.asRelativePath(uri);
        lines.push(`${rel}:${d.range.start.line + 1}:${d.range.start.character + 1} [${sev}] ${d.message}`);
        if (lines.length >= 100) return ok(lines.join("\n") + "\n… (truncated at 100)");
      }
    }
    return ok(lines.length ? lines.join("\n") : "No diagnostics found.");
  },
};

export const getOpenEditorsTool: ToolSpec<Record<string, never>> = {
  id: "get_open_editors",
  displayName: "Get Open Editors",
  description: "List currently open editor tabs with their paths.",
  userDescription: "List open editor tabs",
  readOnly: true,
  schema: z.object({}),
  async execute() {
    const lines: string[] = [];
    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        const input = tab.input;
        if (input instanceof vscode.TabInputText) {
          const active = tab.isActive ? " (active)" : "";
          lines.push(`${vscode.workspace.asRelativePath(input.uri)}${active}`);
        }
      }
    }
    return ok(lines.length ? lines.join("\n") : "No text editors are open.");
  },
};

export const getSelectionTool: ToolSpec<Record<string, never>> = {
  id: "get_selection",
  displayName: "Get Selection",
  description: "Get the text currently selected in the active editor (or the full file path if no selection).",
  userDescription: "Read the active editor selection",
  readOnly: true,
  schema: z.object({}),
  async execute() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return ok("No active editor.");
    const rel = vscode.workspace.asRelativePath(editor.document.uri);
    if (editor.selection.isEmpty) {
      return ok(`No selection. Active file: ${rel}`);
    }
    const text = editor.document.getText(editor.selection);
    const start = editor.selection.start.line + 1;
    const end = editor.selection.end.line + 1;
    return ok(`# Selection in ${rel} (lines ${start}-${end})\n${text}`);
  },
};

export const runCommandTool: ToolSpec<{ command: string; cwd?: string; timeoutSeconds?: number }> = {
  id: "run_command",
  displayName: "Run Command",
  description:
    "Run a shell command in a terminal and capture its output. Use for builds, tests, and CLI tools. Avoid long-running processes (dev servers).",
  userDescription: "Run a terminal command",
  readOnly: false,
  schema: z.object({
    command: z.string().describe("The exact shell command to run"),
    cwd: z.string().optional().describe("Working directory (default: workspace root)"),
    timeoutSeconds: z.number().int().min(5).max(300).optional().describe("Timeout (default 120)"),
  }),
  async execute(input, ctx) {
    if (!ctx.workspaceRoot) return fail("No workspace folder is open.");
    const timeoutMs = (input.timeoutSeconds ?? 120) * 1000;
    const cwd = input.cwd ?? ctx.workspaceRoot;

    return new Promise((resolve) => {
      const child = spawn(input.command, {
        cwd,
        shell: true,
        windowsHide: true,
      });
      let stdout = "";
      let stderr = "";
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill();
        resolve(
          fail(
            `Command timed out after ${timeoutMs / 1000}s.\nPartial output:\n${truncateOutput(stdout, stderr)}`,
          ),
        );
      }, timeoutMs);

      child.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
        if (stdout.length > 400_000) child.kill();
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });
      child.on("error", (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(fail(`Failed to run command: ${String(err)}`));
      });
      child.on("close", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const body = truncateOutput(stdout, stderr);
        if (code === 0) {
          resolve(ok(`Command exited 0.\n${body}`));
        } else {
          resolve(fail(`Command exited ${code}.\n${body}`));
        }
      });
    });
  },
};

function truncateOutput(stdout: string, stderr: string): string {
  const parts: string[] = [];
  if (stdout.trim()) parts.push(`stdout:\n${truncateText(stdout, 60_000)}`);
  if (stderr.trim()) parts.push(`stderr:\n${truncateText(stderr, 20_000)}`);
  return parts.join("\n\n") || "(no output)";
}
