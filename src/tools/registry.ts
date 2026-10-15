import { ToolRegistry } from "./spec";
import { readFileTool, listDirTool, workspaceTreeTool, searchTextTool, applyPatchTool, writeFileTool } from "./builtin/fileTools";
import { gitStatusTool, gitDiffTool } from "./builtin/gitTools";
import { getDiagnosticsTool, getOpenEditorsTool, getSelectionTool, runCommandTool } from "./builtin/vscodeTools";

export function createDefaultRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(readFileTool);
  registry.register(listDirTool);
  registry.register(workspaceTreeTool);
  registry.register(searchTextTool);
  registry.register(applyPatchTool);
  registry.register(writeFileTool);
  registry.register(gitStatusTool);
  registry.register(gitDiffTool);
  registry.register(getDiagnosticsTool);
  registry.register(getOpenEditorsTool);
  registry.register(getSelectionTool);
  registry.register(runCommandTool);
  return registry;
}
