# Cutad.AI — ARCHITECTURE

| Field | Value |
|---|---|
| **Document** | ARCHITECTURE v0.1 (Draft for discussion) |
| **Date** | 2026-10-15 |
| **Status** | 🟡 Draft |
| **Related** | [PRD.md](./PRD.md) · [PLANNING.md](./PLANNING.md) · [ROADMAP.md](./ROADMAP.md) · [STATE.md](./STATE.md) |

---

## 1. System Overview

Cutad.AI is a single VS Code extension (Node.js extension host) with four internal planes:

```
┌───────────────────────────────────────────────────────────────────────┐
│                            VS CODE                                    │
│  ┌─────────────┐  ┌──────────────────┐  ┌──────────────────────────┐  │
│  │ Chat View    │  │ Model Picker     │  │ Tool Confirmation UX     │  │
│  │ (@cutad)     │  │ (vscode.lm)      │  │ (native dialogs)         │  │
│  └──────┬──────┘  └────────┬─────────┘  └────────────┬─────────────┘  │
└─────────┼──────────────────┼──────────────────────────┼───────────────┘
          │ Chat API         │ LM API                   │ LM Tool API
┌─────────▼──────────────────▼──────────────────────────▼───────────────┐
│                        CUTAD.AI EXTENSION                             │
│                                                                       │
│  ┌─────────────────────── PRESENTATION PLANE ──────────────────────┐  │
│  │ ChatParticipant (@cutad)  ·  Slash commands  ·  Follow-ups      │  │
│  │ ChatResponseStream renderer (markdown/progress/buttons/refs)    │  │
│  │ StatusBar (model, rate-limit)  ·  OutputChannel (logs)          │  │
│  └───────────────┬─────────────────────────────────────────────────┘  │
│                  │ AgentEvent stream (text/reasoning/tool/plan)       │
│  ┌───────────────▼─────────────── ORCHESTRATION PLANE ─────────────┐  │
│  │ LangGraph graphs per mode (ask/agent/plan/debug)                │  │
│  │ StateGraph · State (messages, plan, approvals, iteration)       │  │
│  │ interrupt() approval gates · Checkpointer (memory, v1)          │  │
│  │ Context Assembly + Token Budget Manager                         │  │
│  └───────┬───────────────────────────────────────┬─────────────────┘  │
│          │ model calls                           │ tool calls         │
│  ┌───────▼───────────────┐          ┌────────────▼─────────────────┐  │
│  │  LLM GATEWAY PLANE    │          │  TOOL PLANE                  │  │
│  │  GatewayClient        │          │  ToolRegistry (single source)│  │
│  │  (Vercel AI SDK 7 +   │          │  ├─ Builtin tools            │  │
│  │   @ai-sdk/openai-     │          │  ├─ VS Code tools            │  │
│  │   compatible)         │          │  └─ MCP client tools         │  │
│  │  retry/backoff ·      │          │  ApprovalGate                │  │
│  │  error mapping ·      │          │  Adapters:                   │  │
│  │  reasoning extraction │          │   • LangGraph tool           │  │
│  └───────┬───────────────┘          │   • vscode.lm tool           │  │
│          │                          │   • MCP server tool          │  │
│          │                          └────────────┬─────────────────┘  │
│          │                                       │                    │
│  ┌───────▼───────────────┐          ┌────────────▼─────────────────┐  │
│  │  MCP CLIENT           │          │  MCP SERVER (stdio/HTTP)     │  │
│  │  (external servers)   │          │  (exposes ToolRegistry)      │  │
│  └───────────────────────┘          └──────────────────────────────┘  │
│                                                                       │
│  ┌─────────────────────── SUPPORT PLANE ───────────────────────────┐  │
│  │ ConfigService (settings + SecretStorage) · ModelRegistry        │  │
│  │ Logger · ErrorMapper · TruncationPolicy · Telemetry (opt-in)    │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────┬───────────────────────────────────────┘
                                │ HTTPS (SSE)
                    ┌───────────▼────────────┐
                    │  CutadAI Gateway        │
                    │  ai.cutad.web.id/v1     │
                    │  /chat/completions      │
                    │  /responses /models     │
                    └────────────────────────┘
```

**Key property:** every LLM byte to/from the gateway flows through **one** component (`GatewayClient`, built on Vercel AI SDK). Every tool is defined **once** (`ToolRegistry`) and adapted to three consumers (LangGraph, VS Code LM Tools, MCP server). This kills schema drift and centralizes retry/error/approval policy.

---

## 2. Verified Platform API Surface

> Status legend: ✅ verified against official docs on 2026-10-15 · ⚠️ needs verification during implementation (spike task in STATE.md)

### 2.1 VS Code APIs (all stable, no proposed APIs planned for V1)

| API | Use in Cutad.AI | Status |
|---|---|---|
| `vscode.chat.createChatParticipant(id, handler)` | Register `@cutad` participant; handler `(request, context, stream, token)` | ✅ |
| `ChatResponseStream` — `.markdown()`, `.progress()`, `.button()`, `.reference()`, `.anchor()`, `.filetree()` | Render responses, tool progress, apply-code buttons, citations | ✅ |
| `vscode.ChatRequest` — `.prompt`, `.command`, `.variables`, `.model`, `.location` | Intent routing, slash commands, `#`-references, location-aware behavior | ✅ |
| `context.history` (`ChatRequestTurn`/`ChatResponseTurn`) | Conversation continuity | ✅ |
| `participant.followupProvider` (`ChatFollowupProvider`) | Suggested next actions | ✅ |
| `contributes.chatParticipants` (id/name/fullName/description/isSticky/commands/disambiguation) | Manifest declaration, `/ask /agent /plan /debug`, participant detection | ✅ |
| `vscode.lm.registerTool(name, tool)` + `contributes.languageModelTools` (name, tags, toolReferenceName, displayName, modelDescription, userDescription, canBeReferencedInPrompt, icon, inputSchema, `when`) | Expose Cutad tools to agent mode & `#` references | ✅ |
| `vscode.LanguageModelTool<T>` — `invoke()`, `prepareInvocation()` → `{invocationMessage, confirmationMessages}` | Tool impl + custom confirmation UX | ✅ |
| `vscode.LanguageModelToolResult([LanguageModelTextPart])` | Tool result type | ✅ |
| `vscode.lm.registerMcpServerDefinitionProvider(id, provider)` + `contributes.mcpServerDefinitionProviders` | Register Cutad's own MCP server programmatically; `McpStdioServerDefinition`, `McpHttpServerDefinition`, `resolveMcpServerDefinition` for auth | ✅ |
| `vscode.lm.registerLanguageModelChatProvider(vendor, provider)` + `contributes.languageModelChatProviders` (vendor, displayName, managementCommand) | Expose CutadAI models to **all** of VS Code (parking lot — Phase 6+) | ✅ (API exists) |
| `LanguageModelChatProvider` — `provideLanguageModelChatInformation({silent})`, `provideLanguageModelChatResponse(...progress...)`, `provideTokenCount()` | Model provider impl; response parts: `LanguageModelTextPart`, `LanguageModelToolCallPart`, `LanguageModelToolResultPart` | ✅ |
| `vscode.lm.selectChatModels`, `vscode.lm.tools` | Fallback model access (post-V1) / list registered tools | ✅ |
| `vscode.debug`: `startDebugging`, `addBreakpoints`/`removeBreakpoints`, `activeDebugSession`, `onDidStartDebugSession`, `onDidTerminateDebugSession`, `onDidReceiveDebugSessionCustomEvent`, `session.customRequest(...)` (DAP) | Debug mode: launch, breakpoints, read stopped state (threads/stackTrace/scopes/variables) | ✅ namespace; ⚠️ exact DAP request payloads to spike in Phase 4 |
| `vscode.tests` (Test API): `tests.getTestItems`, `onDidChangeTestResults` | Run tests, read results for debug mode | ✅ namespace; ⚠️ exact usage to spike in Phase 4 |
| Terminal shell integration: `window.onDidStartTerminalShellExecution`, `onDidEndTerminalShellExecution`, `TerminalShellExecution.read()` | Capture command output for `run_command` tool | ⚠️ verify exact current names in Phase 2 |
| `vscode.workspace.applyEdit(WorkspaceEdit)` | Atomic multi-file edits (undo-friendly) | ✅ |
| `vscode.SecretStorage` (`context.secrets`) | API key storage | ✅ |
| `vscode.l10n`, `vscode.env.createTelemetryLogger`, `onDidReceiveFeedback` | i18n, opt-in telemetry, participant success metric | ✅ |
| Workspace Trust: `vscode.workspace.isTrusted`, `contributes.untrustedWorkspaces` | Restrict mutating tools in untrusted workspaces | ✅ |

### 2.2 External Packages (verified versions 2026-10-15)

| Package | Version | Role | Notes |
|---|---|---|---|
| `ai` (Vercel AI SDK) | `7.0.141` | LLM transport | ⚠️ `engines.node >= 22` — Node spike is Phase 0 task #2 (R-1) |
| `@ai-sdk/openai-compatible` | `3.0.69` | `createOpenAICompatible` provider for the gateway | ⚠️ same Node caveat |
| `@langchain/langgraph` | `1.5.0` | Graph orchestration, state, interrupts | Dual CJS/ESM; peer `@langchain/core ^1.1.48`; zod ^3.25/^4 |
| `@langchain/core` | `^1.1.48` | Messages, tools, BaseChatModel | Installed per peer range |
| `@langchain/langgraph-checkpoint` | `^1.2.0` | Checkpointer implementations | `MemorySaver` import path ⚠️ verify in Phase 1 |
| `langchain` | `^1.x` | `createAgent` prebuilt (candidate) | ⚠️ decide prebuilt vs custom graph in Phase 1 spike |
| `@langchain/openai` | `^1.6.0` | Reference only (we do NOT use it for transport) | Keep as devDependency for parity tests |
| `@modelcontextprotocol/sdk` | `1.32.1` | MCP client + server | stdio + Streamable HTTP |
| `zod` | `^4.x` | Tool schemas, structured output | Shared by LangChain, MCP SDK, our registry |

---

## 3. Component Design

### 3.1 Presentation Plane

**`chat/CutadParticipant.ts`**
- `createChatParticipant('cutad.chat', handler)`; icon, follow-up provider.
- Handler flow:
  1. Resolve mode from `request.command` (`ask|agent|plan|debug`; default `ask`, or auto when participant detection enabled later).
  2. Build `TurnContext` (mode, prompt, variables, model selection, workspace state).
  3. `stream.progress('Thinking…')` → invoke `AgentRuntime.run(turnContext, stream, token)`.
  4. Render `AgentEvent`s: `text-delta`→`stream.markdown`, `reasoning-delta`→collapsible thinking block (markdown + `<details>`-style rendering or blockquote until native support), `tool-start/end`→`stream.progress`, `reference`→`stream.reference`, `plan-step`→checkbox markdown, `approval-request`→handled via LM tool confirmation or quick-pick (see §3.5), `button`→`stream.button` for Apply.
- Cancellation: `token.onCancellationRequested` → abort controller → graph stop + HTTP abort.

**`chat/render.ts`** — pure functions: `AgentEvent → ChatResponseStream calls`. Unit-testable without VSCode (takes a narrow interface).

**`chat/thinking.ts`** — reasoning buffer; streams into a quote block; auto-collapse at `reasoning-end`.

### 3.2 Orchestration Plane (LangGraph)

**`agent/state.ts`**

```ts
// Conceptual state (Annotation-based in LangGraph 1.x)
type CutadState = {
  mode: 'ask' | 'agent' | 'plan' | 'debug';
  messages: BaseMessage[];          // reduced via message concat
  plan?: PlanArtifact;              // plan mode
  currentStep?: number;             // plan execution cursor
  iteration: number;                // loop guard
  approvals: ApprovalRecord[];      // audit of user decisions
  context: AssembledContext;        // files/diagnostics/etc used
};
```

**`agent/graphs/`**
- `askGraph.ts` — single model node (no tools; read-only tools allowed).
- `agentGraph.ts` — `assemble → model → (tools ⇄ model)* → summarize`, bounded by `cutad.agent.maxIterations`.
- `planGraph.ts` — `plan (structured output) → review interrupt → execute loop {step approval interrupt → agent subgraph → write-back}`.
- `debugGraph.ts` — `collect debug state → model → (debug/test tools)* → explain/fix`.
- Shared subgraph: `toolLoop` (model ↔ tools) reused by agent/debug.

**Graph shape (agent mode):**

```
        ┌─────────────┐
        │  assemble   │  context: files, diagnostics, selection, refs
        └──────┬──────┘
               ▼
        ┌─────────────┐   tool_calls?        ┌─────────────┐
        │   model     │───────yes───────────▶│  tools      │
        │ (GatewayClient│◀───────────────────│ (registry + │
        │  via adapter)│    tool results     │  approval)  │
        └──────┬──────┘                      └─────────────┘
               │ no tool_calls / maxIter
               ▼
        ┌─────────────┐
        │  summarize  │  final message + change summary
        └──────┬──────┘
               ▼
              END
```

**Checkpointing:** `MemorySaver` keyed by chat session id (V1). Persistence to workspace (`sqlite` or file) = parking lot. Interrupt/resume relies on the checkpointer — an interrupted approval must survive graph re-entry.

**Human-in-the-loop:** mutating tool calls and plan steps call LangGraph `interrupt(payload)`; the runtime surfaces the payload to the Chat UI; user decision resumes with `new Command({resume: decision})`. ⚠️ Exact interrupt/Command API to be pinned in Phase 1 spike (documented target: LangGraph.js 1.x `interrupt()` + `Command`).

### 3.3 LLM Gateway Plane — the AI SDK ↔ LangChain Bridge

This is the **central integration decision** (ADR-003). Two frameworks meet here:

```
LangGraph node needs model output
        │  (LangChain BaseMessage[] + bound tools)
        ▼
┌───────────────────────────────┐
│ AiSdkChatModel                │   thin LangChain adapter (our code)
│ extends BaseChatModel         │   - converts messages → gateway request
│  _generate() / _stream()      │   - binds ToolSpecs → AI SDK tools
└──────────────┬────────────────┘
               ▼
┌───────────────────────────────┐
│ GatewayClient (our code)      │   the ONLY HTTP path
│ uses: createOpenAICompatible()│
│       streamText()/generate() │
│       fullStream parts        │
│ retry/backoff · error mapping │
│ reasoning extraction          │
└──────────────┬────────────────┘
               ▼
        HTTPS SSE → CutadAI gateway
```

- **Why this shape:** satisfies "AI SDK for LLM Gateway" + "LangChain/LangGraph for agents" simultaneously, with a single retry/error/streaming layer. LangChain never does HTTP itself; AI SDK never does graph logic.
- **Fallback (documented, if adapter proves brittle):** LangGraph nodes call `GatewayClient` directly and LangGraph is used for state/interrupt/checkpoint only; tool loop hand-rolled in a node. This fallback is tested in the Phase 1 spike (task P1-03) before committing.
- **Reasoning:** `GatewayClient` normalizes any of `reasoning_content`, `reasoning`, or provider-specific delta fields into a single `ReasoningDelta` event; adapter maps to LangChain `additional_kwargs.reasoning_content` so it survives graph state.

**`llm/errors.ts`** — gateway error → `CutadError` taxonomy:

| Gateway | CutadError | UX |
|---|---|---|
| 401 `invalid_api_key` | `AuthError` | "Set API key" action button |
| 403 `model_not_allowed` | `ModelNotAllowedError` | Offer model switch quick-pick |
| 403 (subscription) | `SubscriptionError` | Link to dashboard |
| 404 `model_not_found` | `ModelGoneError` | Refresh model list |
| 413 `request_too_large` | `PayloadTooLargeError` | Reduce context; retry smaller |
| 429 `rate_limit_exceeded` | `RateLimitError` | Honor `retry-after`, auto-retry ≤ N, then message |
| 429 `concurrency_limit_exceeded` | `ConcurrencyError` | Queue single-flight; message |
| 429 `insufficient_quota` | `QuotaError` | Show credits info from body (`credits.remaining/limit/resetPeriod`) |
| 502 `upstream_error` / 503 `circuit_open` | `UpstreamError` | Backoff retry, then message |
| network | `NetworkError` | Backoff retry, then message |

### 3.4 Tool Plane

**`tools/registry.ts`** — single source of truth (D-06):

```ts
interface ToolSpec<I, O> {
  id: string;                    // 'read_file'  ({verb}_{noun})
  displayName: string;
  description: string;           // model-facing (modelDescription)
  userDescription?: string;      // UI-facing
  input: z.ZodType<I>;           // → JSON Schema for all adapters
  readOnly: boolean;             // → readOnlyHint / skip confirmation
  destructive?: boolean;         // hard-blocked from auto-approve
  execute(input: I, ctx: ToolCtx): Promise<ToolResult<O>>;
}
interface ToolCtx {
  workspace: WorkspaceFs;        // sandboxed fs helper (workspace-root confined)
  vscode: VSCodeApi;             // narrow facade (testable)
  token: CancellationToken;
  approval: ApprovalGate;
}
```

**Adapters (generated from ToolSpec):**
1. `adapters/langgraph.ts` — LangChain `tool()` with zod schema + bound execute (approval applied inside execute via `ApprovalGate`).
2. `adapters/lmTool.ts` — `vscode.LanguageModelTool` impl; `prepareInvocation` → confirmation messages from `userDescription` + args; registered only when `canBeReferencedInPrompt`/agent exposure desired. Manifest generated at build time from registry → `contributes.languageModelTools`.
3. `adapters/mcpServer.ts` — MCP `server.registerTool(id, {description, inputSchema}, handler)`; handler routes through `ApprovalGate` (approval must surface in VS Code UI).

**Builtin tools (V1):**

| id | readOnly | Notes |
|---|---|---|
| `read_file` | ✅ | Path-confined; line window; truncation markers |
| `list_dir` | ✅ | Depth-limited |
| `search_text` | ✅ | Uses ripgrep via `vscode.workspace.findTextInFiles` or child process |
| `search_symbols` | ✅ | `vscode.executeWorkspaceSymbolProvider` |
| `get_diagnostics` | ✅ | `vscode.languages.getDiagnostics` filtered |
| `get_open_editors` / `get_selection` | ✅ | Editor state |
| `get_workspace_tree` | ✅ | Bounded |
| `get_terminal_output` | ✅ | From shell-integration capture buffer |
| `write_file` | ❌ | `WorkspaceEdit`; diff preview via confirmation |
| `apply_patch` | ❌ | Unified-diff-ish patch application |
| `run_command` | ❌ | Terminal exec with shell-integration capture; timeout; hard-blocked patterns list |
| `git_status` / `git_diff` | ✅ | Child process `git` (no extension dependency) |
| `get_debug_state` | ✅ | Phase 4; DAP reads |
| `run_tests` | ❌ | Phase 4; Test API + task |

**`tools/approval.ts`** — `ApprovalGate`:
- Decision inputs: tool `readOnly`/`destructive`, settings `cutad.agent.autoApprove[]`, session allow-list, workspace trust.
- Surfaces: (a) inside chat flow — VS Code LM tool confirmation when invoked as LM tool; (b) graph-internal invocations — `vscode.window.showQuickPick`/`showWarningMessage` modal with args preview; (c) MCP-server invocations — modal in VS Code, denial → MCP error result.
- `destructive` tools can **never** be auto-approved (hard list: file delete, `git reset --hard`, `git push --force`, `rm -rf`-class commands).

**`tools/truncate.ts`** — policy: per-tool max bytes/lines; explicit `… [truncated N lines]` markers; configurable.

### 3.5 MCP Client (`mcp/client/`)

- **Server discovery:** read VS Code MCP config surfaces (`.vscode/mcp.json`, user profile config) + own setting `cutad.mcp.servers` (JSON, same schema shape as `mcp.json` `servers` object).
- **Transport:** `StdioClientTransport` (spawn child process), `StreamableHTTPClientTransport` (URL + headers); SSE legacy best-effort.
- **Lifecycle:** connect on activation (lazy per server), health state, restart on crash with backoff; `onDidChange` from config watcher.
- **Tools:** `client.listTools()` → wrapped as dynamic `ToolSpec`s with `id = "${serverName}_${toolName}"`; `readOnlyHint` → `readOnly`; `title` → displayName; dynamic tool updates re-register.
- **Auth:** if server needs OAuth → surface VS Code auth flow / prompt for token into SecretStorage keyed by server id.
- **Resources/prompts:** Phase 5 P1 items (attach as context, slash commands).

### 3.6 MCP Server (`mcp/server/`)

- **Transport:** stdio (`Server` from MCP SDK over stdio). Command: `Cutad.AI: Start MCP Server` (palette) and CLI entry `node dist/mcp-server.js --stdio` for external configs.
- **Exposure:** subset of `ToolRegistry` — workspace read tools + edit/terminal tools (mutating ones **always** gated by VS Code modal approval; Q-4 open).
- **Binding:** bound to the workspace root of the running VS Code window; if multiple windows, each instance serves its own workspace.
- **Optional registration into VS Code itself:** `vscode.lm.registerMcpServerDefinitionProvider` — lets Cutad expose its MCP server to VS Code's own agent mode (nice-to-have; ensures one canonical config).

### 3.7 Support Plane

- **`config/`**: settings read/write with change events; `SecretStore` wrapper; `ModelRegistry` (from `GET /v1/models`, cached with TTL; maps id → context_window, max_output_tokens, display_name).
- **`context/assembler.ts`**: builds bounded context: active file + selection, `#`-referenced variables, diagnostics (errors/warnings), recently touched files, workspace tree summary. `budget.ts`: token estimate (chars/4 heuristic + model maxInputTokens from registry) with priority ordering and explicit omission notes ("5 files omitted — ask to include").
- **`util/logger.ts`**: OutputChannel `Cutad.AI`, leveled; never logs prompt/key contents at default level.
- **`util/telemetry.ts`**: opt-in; event names only, no code/prompt payloads.

---

## 4. Key Data Flows

### 4.1 Chat turn (ask mode)

```
User: @cutad /ask "how does auth work?"
  → CutadParticipant.handler
  → TurnContext{mode:ask, prompt, variables}
  → AgentRuntime.run → askGraph.invoke({messages, context})
      → assemble node: context assembler (budget)
      → model node: AiSdkChatModel.stream(messages)
          → GatewayClient: createOpenAICompatible.streamText
          → SSE deltas → GatewayEvent{text-delta|reasoning-delta|usage|done}
      → events → render.ts → stream.markdown / thinking block
  → references → stream.reference
  → followups → participant.followupProvider
```

### 4.2 Agent turn with approval (agent mode)

```
@cutad /agent "rename getUser to fetchUser + fix tests"
  → agentGraph.invoke
  → model → tool_call(apply_patch, {...})
  → ApprovalGate.request(tool, args)
       readOnly? no → autoApprove? no → show confirmation (modal w/ diff preview)
       → approved → execute → WorkspaceEdit applied
       → denied → tool result "User denied" → model continues
  → model → tool_call(run_command, "npm test")
       → confirmation shows exact command → approved → terminal run + capture
       → output → tool result (truncated) → model
  → no tool_calls → summarize → final markdown + file list
  → checkpointer saves state after each node (session id)
```

### 4.3 MCP server turn (external agent drives VS Code)

```
Claude Code (external MCP client)
  → stdio → Cutad MCP Server → tool handler(id=apply_patch)
  → ApprovalGate (modal in VS Code: "External MCP client requests…")
  → approved → execute against workspace → result JSON → back over stdio
  → denied → MCP error response {code, message:"User denied"}
```

### 4.4 Debug turn

```
@cutad /debug "why does test X fail?"
  → debugGraph
  → run_tests tool (Test API / task) → results
  → get_debug_state tool:
       activeDebugSession? customRequest('threads') → ('stackTrace') → ('scopes') → ('variables')
       breakpoints via vscode.debug.breakpoints
  → model correlates source (read_file) + runtime state → explanation + proposed fix
  → (optional) startDebugging to reproduce with a launch config, on approval
```

---

## 5. Architecture Decision Records (ADRs)

### ADR-001: Native Chat Participant as the UI surface
**Status:** Accepted (D-01). **Context:** Custom webview gives layout control but reimplements streaming/approval/a11y; Chat API gives native UX + tool confirmations + model picker. **Decision:** `@cutad` participant in Chat view; webviews deferred. **Consequences:** Less layout control; must work within `ChatResponseStream` primitives; faster to ship, native approvals, future-proof (platform invests here).

### ADR-002: CutadAI gateway as sole LLM provider
**Status:** Accepted (D-04). **Decision:** One provider via `@ai-sdk/openai-compatible` (`baseURL: https://ai.cutad.web.id/v1`). **Consequences:** Simple config; provider-agnostic adapter kept thin so multi-provider later is additive (new provider instance, same GatewayClient interface).

### ADR-003: AI SDK = transport, LangGraph = orchestration, bridged by `AiSdkChatModel`
**Status:** Accepted with fallback (see §3.3). **Context:** Requirement mandates both; naive dual stacks duplicate HTTP/retry/streaming. **Decision:** All HTTP via AI SDK inside `GatewayClient`; LangChain `BaseChatModel` adapter delegates to it; graphs consume the adapter. **Fallback:** direct-call nodes if adapter proves brittle (decided by P1-03 spike). **Consequences:** Single retry/error/reasoning layer; small impedance tax (message/tool type conversion); LangChain ecosystem (messages, tool binding) still usable.

### ADR-004: ToolRegistry single source + three adapters
**Status:** Accepted (D-06). **Consequences:** One zod schema → JSON Schema for LM Tools & MCP; approval/truncation centralized; adding a tool = one file + adapters pick it up automatically; manifest codegen for `contributes.languageModelTools`.

### ADR-005: MCP both directions (client + server)
**Status:** Accepted (D-02). **Consequences:** Cutad both consumes ecosystems and becomes infrastructure; MCP server path introduces a remote-driver threat surface → approval gate mandatory (§6).

### ADR-006: Secrets in `SecretStorage`; settings hold only non-secrets
**Status:** Accepted (D-10). **Consequences:** No key leakage via settings sync/logs; "Set API key" command + first-run prompt.

### ADR-007: In-memory checkpointing V1, persistence post-V1
**Status:** Accepted. **Context:** `MemorySaver` survives within session only. **Consequences:** Resume works across interrupts (same session) but not across window reload; plan artifacts on disk provide cross-session durability for planning (plan file is the durable state; graph state is reconstructible from it). Persistence (sqlite) is parking lot.

### ADR-008: Approval gate is a first-class component, not a UI detail
**Status:** Accepted. **Context:** Mutations come from 3 invocation paths (chat graph, LM tool calls, MCP server). **Decision:** `ApprovalGate` owns policy; UIs are surfaces. **Consequences:** Consistent safety; testable policy; hard-blocked destructive list enforced in one place.

### ADR-009: esbuild bundling, `vscode` external, single extension file per entry
**Status:** Accepted (D-11). **Consequences:** Fast builds; must handle LangGraph/AI SDK dual-package resolution (`mainFields: ['module','main']` with `platform:'node'`); MCP server CLI needs its own entry (`dist/mcp-server.js`).

---

## 6. Security & Privacy Architecture

| Threat | Vector | Mitigation |
|---|---|---|
| API key leakage | Settings sync, logs, crashes | `SecretStorage` only; logger redaction; never echo key |
| Prompt injection via tool output | Malicious repo content (README, code comments) instructing the agent | Approval gate on all mutations; system prompt hardening; tool outputs treated as data (delimited, labeled); destructive hard-block list |
| Path traversal | Tool args `../../etc/passwd` | All fs tools confined to workspace root via `WorkspaceFs`; escape attempts rejected with error to model |
| Command injection | `run_command` with crafted strings | Exact command shown at approval; never auto-run in untrusted workspaces; destructive pattern blocklist (`rm -rf /`, force push, `curl | sh` class) flagged as destructive |
| External MCP client abuse | Any process driving VS Code via Cutad MCP server | Approval modal names the requesting server; denial is safe; server bound to workspace; no secrets exposed to MCP clients |
| Untrusted workspace | Opened repo without trust | `untrustedWorkspaces` capability declared; mutating tools disabled; chat read-only tools only |
| Data exfiltration via context | Over-broad context assembly | Context budget lists exactly what was sent; `#`-refs explicit; no background scanning beyond request scope |
| Telemetry privacy | Usage stats | Opt-in only; event names/ counts, never prompt/code content |
| Supply chain | Fast-moving deps | Exact version pins (§2.2); lockfile committed; upgrade tasks explicit |

---

## 7. Configuration Schema (package.json sketch)

```jsonc
{
  "contributes": {
    "chatParticipants": [{
      "id": "cutad.chat", "name": "cutad", "fullName": "Cutad.AI",
      "description": "AI coding, debugging & planning assistant",
      "isSticky": true,
      "commands": [
        {"name": "ask",   "description": "Ask about the codebase (read-only)"},
        {"name": "agent", "description": "Run a coding task with tools"},
        {"name": "plan",  "description": "Create or execute a step-by-step plan"},
        {"name": "debug", "description": "Investigate failures with debugger & test state"}
      ]
    }],
    "languageModelTools": [ /* generated from ToolRegistry at build time */ ],
    "mcpServerDefinitionProviders": [{ "id": "cutad", "label": "Cutad.AI Tools" }],
    "commands": [
      {"command": "cutad.setApiKey",      "title": "Cutad.AI: Set API Key"},
      {"command": "cutad.selectModel",    "title": "Cutad.AI: Select Model"},
      {"command": "cutad.testConnection", "title": "Cutad.AI: Test Connection"},
      {"command": "cutad.startMcpServer", "title": "Cutad.AI: Start MCP Server"},
      {"command": "cutad.showDiagnostics","title": "Cutad.AI: Show Diagnostics"}
    ],
    "configuration": {
      "title": "Cutad.AI",
      "properties": {
        "cutad.baseUrl":   { "type": "string",  "default": "https://ai.cutad.web.id/v1" },
        "cutad.model":     { "type": "string",  "default": "" },
        "cutad.temperature": { "type": "number", "default": 0.2 },
        "cutad.maxOutputTokens": { "type": "integer", "default": 4096 },
        "cutad.reasoning.show": { "type": "boolean", "default": true },
        "cutad.agent.maxIterations": { "type": "integer", "default": 25 },
        "cutad.agent.autoApprove": { "type": "array", "items": {"type":"string"}, "default": [] },
        "cutad.tools.truncateKB": { "type": "integer", "default": 64 },
        "cutad.mcp.servers": { "type": "object", "default": {} },
        "cutad.plans.directory": { "type": "string", "default": ".cutad/plans" },
        "cutad.telemetry.enabled": { "type": "boolean", "default": false }
      }
    }
  }
}
```

---

## 8. Error & Failure Architecture

- **Every layer emits typed errors** (`CutadError` subclasses) with `{ userMessage, actionLabel?, retryable, cause }`.
- **Chat surface**: errors render as markdown with action buttons (`stream.button`) where applicable ("Open API Keys Dashboard", "Select another model", "Retry").
- **Agent loop**: tool failures return structured error results to the model (so it can adapt); fatal errors abort with summary of partial progress.
- **MCP server**: errors returned as MCP error responses; never crash the server on a single tool failure.
- **Circuit safety**: single in-flight agent run per window (concurrency guard); queue additional requests with progress note.

---

## 9. Performance Budget

| Concern | Budget | Mechanism |
|---|---|---|
| Activation | < 300ms | Lazy registration; no network on activate; heavy imports (LangGraph) loaded on first chat use (dynamic import) |
| First token | p50 < 2s | Streaming end-to-end; context assembly capped by budget |
| Tool output | ≤ 64KB default | Truncation policy |
| Graph memory | < 150MB steady | Bounded messages (window), truncated tool results, memory checkpointer pruned per session |
| Bundle | < 5MB dist | esbuild minify; tree-shake LangGraph prebuilts if unused |

---

## 10. Verification Status & Spikes Required

Before Phase 1 coding completes, these must be verified by spike (tracked in STATE.md):

| # | Spike | Blocks | Fallback if fails |
|---|---|---|---|
| S-1 | Extension-host Node version ≥ 22? | AI SDK 7 choice (R-1) | Pin `ai@6.x` + `@ai-sdk/openai-compatible@2.x`; record in PLANNING §1.2 |
| S-2 | `MemorySaver` import path + `interrupt()/Command` API in `@langchain/langgraph@1.5.0` | Phase 1 graph | Adjust imports; use documented 1.x equivalents |
| S-3 | LangGraph + AI SDK load under esbuild in extension host (CJS) | Bundling (R-4) | Worker-thread isolation; or fallback bridge (§3.3) |
| S-4 | Gateway returns reasoning content; field name | Phase 1 reasoning UI (R-3) | Normalize via middleware; degrade to no-thinking UI |
| S-5 | Gateway tool-call streaming shape (OpenAI-style deltas) | Phase 2 tools (R-2) | Non-streamed tool calls; capability registry |
| S-6 | Terminal shell integration API names current | Phase 2 `run_command` | Fallback to `child_process.spawn` with PTY-less capture |
| S-7 | DAP `customRequest` payloads for threads/stack/scopes/variables | Phase 4 | Document manual mapping per adapter |
| S-8 | MCP SDK client+server roundtrip in extension host | Phase 5 | Adjust transport (HTTP instead of stdio) |

---

## 11. Traceability

| Requirement | Components |
|---|---|
| FR-1 Config/Auth | §3.7 ConfigService/SecretStore, commands §7 |
| FR-2 Gateway | §3.3 GatewayClient, errors table |
| FR-3 Agent | §3.2 graphs, §3.3 adapter |
| FR-4 Tools | §3.4 registry + adapters + builtin table |
| FR-5 MCP client | §3.5 |
| FR-6 MCP server | §3.6 |
| FR-7 Chat UX | §3.1 |
| FR-8 Logging | §3.7 |
| NFR-1/2 Perf | §9 |
| NFR-4/5 Security | §6 |

---

*End of ARCHITECTURE v0.1 — spikes S-1…S-8 are the first implementation actions; see ROADMAP Phase 0.*
