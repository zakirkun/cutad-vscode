export const DiagnosticSeverity = { Error: 0, Warning: 1, Information: 2, Hint: 3 };
export const StatusBarAlignment = { Left: 1, Right: 2 };
export const ProgressLocation = { SourceControl: 1, Window: 10, Notification: 15 };
export const languages = { getDiagnostics: () => [] };
export const workspace = { asRelativePath: (p) => String(p), workspaceFolders: undefined, isTrusted: true };
export const window = { activeTextEditor: undefined, tabGroups: { all: [] }, createStatusBarItem: () => ({}), showQuickPick: async () => undefined, showWarningMessage: () => undefined };
export const commands = { registerCommand: () => ({ dispose: () => undefined }) };
export const lm = { registerTool: () => ({ dispose: () => undefined }), registerMcpServerDefinitionProvider: () => ({ dispose: () => undefined }) };
export const chat = { createChatParticipant: () => ({ dispose: () => undefined }) };
export const env = { createTelemetryLogger: () => ({}) };
export class Uri { static file(p) { return { scheme: "file", fsPath: p, path: p }; } static parse(s) { return { scheme: "test", fsPath: s, path: s }; } }
export class TabInputText { constructor(uri) { this.uri = uri; } }
export class CancellationTokenSource { constructor() { this.token = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose: () => undefined }) }; } cancel() {} dispose() {} }
export class LanguageModelTextPart { constructor(value) { this.value = value; } }
export class LanguageModelToolResult { constructor(parts) { this.content = parts; } }
export class MarkdownString { constructor(value) { this.value = value; } }
export const ChatRequestTurn = class {};
export const ChatResponseTurn = class {};
export const ChatResponseMarkdownPart = class {};
