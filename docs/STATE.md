# Cutad.AI — STATE (Implementation Tracker)

| Field | Value |
|---|---|
| **Document** | STATE v0.1 — **LIVING DOCUMENT (update on every task state change)** |
| **Date** | 2026-10-15 |
| **Current Phase** | Phase 0 — not started |
| **Overall Status** | 🟡 Planning complete, awaiting GO |
| **Related** | [PRD.md](./PRD.md) · [PLANNING.md](./PLANNING.md) · [ARCHITECTURE.md](./ARCHITECTURE.md) · [ROADMAP.md](./ROADMAP.md) |

**Status legend:** ⬜ TODO · 🟡 IN PROGRESS · ✅ DONE · ⏸️ BLOCKED · ❌ CANCELLED · 🔁 CHANGED

**Update protocol:** after completing any task → set ✅ + fill *Evidence* + date. After any decision → append to §8 Decision Log. Never delete rows; mark ❌/🔁 instead.

---

## 0. Phase Status Board

| Phase | Name | Status | Gate passed | Started | Completed |
|---|---|---|---|---|---|
| P0 | Foundation & Spikes | 🟡 IN PROGRESS | ⬜ | 2026-10-15 | — |
| P1 | Chat Mode (`/ask`) | 🟡 IN PROGRESS | ⬜ | 2026-10-15 | — |
| P2 | Coding Agent (`/agent`) | 🟡 IN PROGRESS | ⬜ | 2026-10-15 | — |
| P3 | Planning (`/plan`) | ⬜ TODO | ⬜ | — | — |
| P4 | Debug (`/debug`) | ⬜ TODO | ⬜ | — | — |
| P5 | MCP (Client + Server) | ⬜ TODO | ⬜ | — | — |
| P6 | Hardening & Release | ⬜ TODO | ⬜ | — | — |

**Blocker watch:** ~~R-1 (Node ≥22 for AI SDK 7)~~ ✅ **RESOLVED 2026-10-15** — extension host = Electron 43.7.7 → Node v24.21.0 ≥ 22. AI SDK 7 stays. ~~R-4 (LangGraph bundling)~~ ✅ **RESOLVED 2026-10-15** — S-3 spike passed: StateGraph + AI SDK run from esbuild CJS bundle. ~~R-3 (reasoning format)~~ ✅ **RESOLVED 2026-10-15** — S-4 spike passed: gateway returns `reasoning-start/delta/end` parts when `providerOptions: { cutad: { reasoningEffort } }` is set; without it reasoning is inline text.
**New finding:** IPv6-first DNS hangs on this network → `setDefaultResultOrder("ipv4first")` applied in `src/llm/gateway.ts` (single HTTP path).

---

## 1. Phase 0 — Foundation & Spikes

**Phase goal:** de-risk stack + skeleton extension with streaming placeholder participant.
**Demo script:** `F5` → `@cutad hello` streams a response; `npm test` green; bundle report printed.

### 1.1 Scaffold

| ID | Task | Status | Evidence | Date |
|---|---|---|---|---|
| P0-01 | Create repo scaffold: `package.json` (engine, scripts, contributions stub), `tsconfig.json` (strict), `esbuild.mjs`, ESLint + Prettier config, `.gitignore`, `.vscode/launch.json` + `tasks.json` | ✅ | All files written; `tsc --noEmit` exit 0 | 2026-10-15 |
| P0-02 | Install deps (exact pins): `ai@7.0.141`, `@ai-sdk/openai-compatible@3.0.69`, `@langchain/langgraph@1.5.0`, `@langchain/core@1.2.17`, `@langchain/langgraph-checkpoint@1.2.0`, `langchain@1.5.16`, `@modelcontextprotocol/sdk@1.32.1`, `zod@4.6.7`; devDeps: `vitest@5.0.4`, `@vscode/test-electron@3.1.0`, `@types/vscode@1.140.0`, `esbuild@0.28.2`, `typescript@5.9.3`, eslint stack | ✅ | `npm install` — 298 packages, 0 peer conflicts | 2026-10-15 |
| P0-03 | Extension skeleton: `src/extension.ts` activate/deactivate; `@cutad` participant **wired to real gateway** (streamText + reasoning deltas); commands: setApiKey, testConnection, showDiagnostics, openConfig | ✅ | `dist/extension.js` 3.4mb built; participant streams real model output | 2026-10-15 |

### 1.2 Spikes (de-risking)

| ID | Task | Status | Evidence | Date |
|---|---|---|---|---|
| P0-04 | **S-1 Node spike** — ✅ **PASSED**: VS Code 1.141.1 stable (staged 1.142.0), Electron 43.7.7, embedded Node v24.21.0 ≥ 22. AI SDK 7 kept; R-1 closed | ✅ | Binary scan: `Electron/43.7.7`, `node.js/v24.21.0`; local node v22.21.1 | 2026-10-15 |
| P0-05 | ~~Mock gateway~~ 🔁 **CHANGED by user decision**: no mocks. Tests run against the **real gateway** (`ai.cutad.web.id/v1`) with the user's key. Config lives in `~/.cutad/config.json` | ✅ | `test/integration/gateway.test.ts` — 5/5 pass against live gateway | 2026-10-15 |
| P0-06 | **S-3 bundle spike** — ✅ **PASSED**: LangGraph `StateGraph` invoke + AI SDK provider construct both work from esbuild CJS bundle | ✅ | `node dist/host-smoke.js` → `S-3 OK: node=v22.21.1 graph=langgraph-ok:spike provider=spike-model` | 2026-10-15 |
| P0-07 | **Gateway smoke (real)** — ✅: `GET /v1/models` (25 models), non-streaming completion, streaming deltas, 401 on bad key — all verified via test suite | ✅ | `npx vitest run` → 5 passed; models list captured incl. `workbuddy/deepseek-v4.1-flash` | 2026-10-15 |
| P0-08 | **S-4 reasoning spike** — 🟡 PARTIAL: model `workbuddy/deepseek-v4.1-flash` advertises `capabilities.reasoning=true`; reasoning-delta wiring implemented in participant; **full reasoning-shape verification deferred to Phase 1** (needs a prompt that triggers thinking + inspection of delta shape) | 🟡 | `/v1/models` capability flags captured | 2026-10-15 |
| P0-09 | **Framework decision spike** — ⬜ deferred to Phase 1 planning (prebuilt `createAgent` vs custom `StateGraph`); S-3 proves `StateGraph` works, so default is custom graph unless Phase 1 favors prebuilt | ⬜ | | |

### 1.3 CI & Quality

| ID | Task | Status | Evidence | Date |
|---|---|---|---|---|
| P0-10 | `npm test` wiring: Vitest with real-gateway integration suite (IPv4-first DNS setup; 120s timeouts for live calls) | ✅ | `npx vitest run` → 5/5 passed (23.3s) | 2026-10-15 |
| P0-11 | `@vscode/test-electron` smoke — ⬜ deferred: requires downloading VS Code test binary; manual F5 verification is available now. Revisit if CI needs it | ⬜ | F5 launch config present (`.vscode/launch.json`) | 2026-10-15 |

### 1.4 Phase 0 Gate

- [x] `@cutad` wired to real gateway — streams live model output (P0-03)
- [x] Node/AI-SDK decision recorded: **AI SDK 7 stays** (P0-04) — R-1 closed
- [x] LangGraph runs in bundle (P0-06) — R-4 closed
- [x] Real-gateway test suite green (P0-07, P0-10) — 5/5
- [x] Config system: `~/.cutad/config.json` (home-basedir) holds key + baseUrl + model (P0-05)
- [ ] S-4 full reasoning-shape verification (deferred to Phase 1 — partial evidence captured)
- [ ] P0-09 framework decision (deferred to Phase 1 planning)
- [ ] **Manual F5 demo by user** — the final Phase 0 gate item

**Phase 0 status: 8/11 tasks ✅, 2 deferred to Phase 1, 1 manual step awaiting user (F5 demo).**

---

## 2. Phase 1 — Chat Mode (`/ask`)

**Phase goal:** useful read-only assistant: streaming, reasoning, robust errors, model picker, context.
**Demo script:** first-run (key → model → question with `#file` ref → streamed answer + thinking → cancel → retry → force 429 via mock → clean error + auto-retry).

### 2.1 LLM Gateway Plane

| ID | Task | Status | Evidence | Date |
|---|---|---|---|---|
| P1-01 | `src/llm/gateway.ts`: `createOpenAICompatible` provider; `listModels` with full model metadata (ctx, maxout, reasoning flag); `GatewayError`; IPv4-first DNS fix | ✅ | Live models list verified (25 models) | 2026-10-15 |
| P1-02 | `src/llm/errors.ts`: `CutadError` taxonomy + mapper for all gateway codes (auth/model-not-allowed/subscription/model-gone/payload/rate-limit/concurrency/quota/upstream/network/canceled/unknown) incl. `AI_RetryError` unwrap + credits info | ✅ | 12 unit tests green (`test/unit/errors.test.ts`) | 2026-10-15 |
| P1-03 | Retry/backoff: delegated to AI SDK native retry (verified: honors `retry-after`/`retry-after-ms`, 0–60s); our layer maps final errors to UX | ✅ | AI SDK source verified: `retryAfterMs`/`retryAfter` parsing present | 2026-10-15 |
| P1-04 | `src/llm/runtime.ts`: `AgentEvent` contract (text/reasoning/progress/usage/rate-limit/error/done) + `runAsk()` streaming loop; reasoning gated by `reasoningEffort` provider option | ✅ | Integration test "emits separated reasoning deltas" green | 2026-10-15 |
| P1-05 | `AiSdkChatModel` LangChain bridge — ⬜ **deferred**: Phase 1 chat calls the gateway directly (no LangGraph in the hot path); the bridge arrives with Phase 2's agent graph per ADR-003 | ⬜ | Design unchanged; ADR-003 still applies to Phase 2 | 2026-10-15 |
| P1-06 | Rate-limit capture: `x-ratelimit-remaining`/`reset` from `result.response` headers → status bar item (`$(pulse) CutadAI N`) | ✅ | Wired in participant; header parse in runtime | 2026-10-15 |

### 2.2 Auth & Model Registry

| ID | Task | Status | Evidence | Date |
|---|---|---|---|---|
| P1-07 | Auth UX: `cutad.setApiKey` writes to `~/.cutad/config.json`; first-run message points at config path; `cutad.openConfig` opens the file | ✅ | Commands registered + in package.json | 2026-10-15 |
| P1-08 | `listModels` in gateway.ts with metadata mapping; TTL cache — 🔁 simplified: no cache in P1 (fetched on demand); revisit if rate limits bite | ✅ | — | 2026-10-15 |
| P1-09 | `cutad.selectModel` QuickPick: models with ctx/out/reasoning badges, check-mark on current, persists to config | ✅ | Command registered | 2026-10-15 |
| P1-10 | `cutad.testConnection`: lists models + reports configured model found/not-found with counts | ✅ | Live verified in Phase 0 | 2026-10-15 |

### 2.3 Context & Graph (ask)

| ID | Task | Status | Evidence | Date |
|---|---|---|---|---|
| P1-11 | `src/context/assembler.ts`: `#`-references (Uri/Location/string), active file or selection, diagnostics summary; async-safe file reads | ✅ | Implemented; VSCode-dependent (smoke via F5) | 2026-10-15 |
| P1-12 | `src/context/budget.ts`: token estimation, priority fit, omission notes, model-aware budget caps | ✅ | 5 unit tests green (`test/unit/budget.test.ts`) | 2026-10-15 |
| P1-13 | Ask flow: direct gateway streaming (no graph) — 🔁 per P1-05 deferral; context+history assembled in participant; checkpointing arrives with Phase 2 graph | ✅ | Working end-to-end in tests | 2026-10-15 |
| P1-14 | `AgentEvent` runtime contract + cancellation propagation (AbortController from CancellationToken) | ✅ | Cancel test green; abort wired | 2026-10-15 |

### 2.4 Chat UX

| ID | Task | Status | Evidence | Date |
|---|---|---|---|---|
| P1-15 | Participant: mode routing (`/ask` default, `/help`, Phase-2-4 notices), history usage (last 6 turns, 500-char truncation) | ✅ | Handler implemented | 2026-10-15 |
| P1-16 | `src/chat/render.ts`: `AgentEvent → StreamSink` (markdown/progress/button); pure + unit tested | ✅ | 6 unit tests green (`test/unit/render.test.ts`) | 2026-10-15 |
| P1-17 | Thinking UI: blockquote streaming with `> **Thinking…**` header, per-line prefix, auto-close before text; `reasoning.show` config gate | ✅ | Render tests + S-4 integration test | 2026-10-15 |
| P1-18 | Code-block actions — ⬜ deferred to Phase 2 (Apply/Insert need WorkspaceEdit tooling which lands with the tool registry) | ⬜ | — | 2026-10-15 |
| P1-19 | Cancellation: token → AbortController → `abortSignal`; `(canceled)` note rendered | ✅ | Render test green | 2026-10-15 |
| P1-20 | Follow-ups: 3 contextual suggestions via `followupProvider` (suppressed for help mode) | ✅ | Implemented | 2026-10-15 |
| P1-21 | Error UX: `renderError` (title+detail) + action button (openConfig / selectModel) from taxonomy | ✅ | Error tests + participant wiring | 2026-10-15 |

### 2.5 Logging

| ID | Task | Status | Evidence | Date |
|---|---|---|---|---|
| P1-22 | `util/logger.ts` OutputChannel with levels; never logs key/prompt at default | ✅ | In place since Phase 0 | 2026-10-15 |
| P1-23 | `cutad.showDiagnostics`: version/model/config-path/key-presence | ✅ | Command implemented | 2026-10-15 |

### 2.6 Phase 1 Gate

- [x] US-1 (first-run) path implemented — key message + config file + testConnection
- [x] US-2 core: streaming markdown ✅, reasoning display ✅, cancel ✅, error mapping ✅
- [x] Error matrix covered by unit tests (all 12 kinds) — live 401 verified in Phase 0
- [x] 29/29 tests green (4 files: errors 12, budget 5, render 6, gateway 6)
- [x] TSC clean; bundle builds (3.5mb)
- [ ] **Manual F5 verification by user** — streaming + thinking block in Chat view
- ⬜ Deferred (documented): P1-05 LangChain bridge → Phase 2; P1-18 code actions → Phase 2

**Phase 1 status: 20/23 tasks ✅, 2 deferred to Phase 2 (documented), 1 manual F5 awaiting user.**

---

## 3. Phase 2 — Coding Agent Mode (`/agent`)

**Phase goal:** autonomous multi-file coding with full tool registry + approvals.
**Demo script:** rename symbol across repo + fix tests; one denial; one test-failure iteration; untrusted workspace check.

### 3.1 Tool Framework

| ID | Task | Status | Evidence | Date |
|---|---|---|---|---|
| P2-01 | `src/tools/spec.ts`: `ToolSpec` interface (id/displayName/description/schema/readOnly/destructive/execute), `ToolRegistry` container with duplicate-id guard, `ok()`/`fail()` result helpers | ✅ | 12 tools registered in `registry.ts` | 2026-10-15 |
| P2-02 | Truncation: `truncateText` with explicit `[truncated N lines]` markers in `context/budget.ts`; per-tool limits applied (run_command 60KB stdout/20KB stderr, git 40KB) | ✅ | Unit tested (budget.test.ts) | 2026-10-15 |
| P2-03 | `approvalPolicy.ts` (`decidePolicy` policy engine: untrusted→deny-mutating, readOnly→auto-allow, destructive→forced-prompt, session/config allow) + `approvalGate.ts` (QuickPick UX: allow once / always session / deny) + `SessionApprovals` | ✅ | 9 unit tests green (all policy branches) | 2026-10-15 |
| P2-04 | `fsGuard.ts`: `resolveInWorkspace` (path.resolve + relative escape check), `readWorkspaceFile`, `listWorkspaceDir`, `isDestructiveCommand` (14 patterns: rm -rf, git reset --hard, force push, curl\|sh, PowerShell Remove-Item…) | ✅ | 6 unit tests green incl. traversal rejection | 2026-10-15 |
| P2-05 | LangGraph tool adapter — 🔁 **superseded by design decision**: agent loop uses AI SDK native tool loop (`streamText` + `tool()` + `stopWhen: stepCountIs`); LangGraph `StateGraph` reserved for Phase 3 plan execution where state/interrupts are actually needed (documented in Decision Log #12) | 🔁 | — | 2026-10-15 |
| P2-06 | `lmTools.ts`: ToolSpec → `vscode.LanguageModelTool` adapter with `prepareInvocation` confirmation messages + gate routing; `scripts/gen-tools-manifest.mjs` generates `contributes.languageModelTools` from registry at build time (12 entries with JSON schemas) | ✅ | Manifest generated: 12 tools in package.json | 2026-10-15 |

### 3.2 Builtin Tools

| ID | Task | Status | Evidence | Date |
|---|---|---|---|---|
| P2-07 | Read tools: `read_file` (numbered lines + range), `list_dir`, `search_text` (regex + extension filter, 500-file walk with skip-dirs), `get_workspace_tree` (depth-limited) | ✅ | 9 unit tests green (fileTools.test.ts) | 2026-10-15 |
| P2-08 | Editor tools: `get_diagnostics` (severity + path filter, 100-cap), `get_open_editors`, `get_selection` | ✅ | Implemented (VSCode-dependent; F5 smoke) | 2026-10-15 |
| P2-09 | `write_file` (nested mkdir, create/overwrite report) + `apply_patch` (unique-match enforcement, ambiguity rejection, exact-text requirement) | ✅ | 6 unit tests green incl. non-matching + ambiguous rejection | 2026-10-15 |
| P2-10 | `run_command`: child_process spawn with shell, 120s default timeout, output caps, exit-code reporting, destructive-pattern detection feeding the forced-prompt policy | ✅ | Destructive detection unit tested; live run verified in agent loop | 2026-10-15 |
| P2-11 | `git_status` (porcelain+branch), `git_diff` (staged flag, path filter), execFile with 2MB buffer + timeout | ✅ | Implemented | 2026-10-15 |
| P2-12 | `get_terminal_output` — 🔁 **replaced by direct capture**: `run_command` captures stdout/stderr directly (shell-integration buffer adds complexity without benefit for agent flows); revisit in Phase 4 if debug workflows need ambient terminal history | 🔁 | — | 2026-10-15 |

### 3.3 Agent Loop

| ID | Task | Status | Evidence | Date |
|---|---|---|---|---|
| P2-13 | `llm/agentRuntime.ts`: `runAgent()` — AI SDK tool loop (`streamText` + tools + `stopWhen: stepCountIs(maxIterations)`), typed tool events (tool-start/tool-end with previews), workspace root enforcement, AbortSignal cancellation | ✅ | **Live integration test green** (reads buggy file → applies fix → verifies) | 2026-10-15 |
| P2-14 | Denial handling: denied tools return "User denied this action. Do not retry…" to the model; tool errors surfaced as `tool-error` events; loop bounded by stepCountIs | ✅ | Live denial test green (file untouched after denial) | 2026-10-15 |
| P2-15 | Change summary: tool call count + denied count + files-changed list appended to chat response | ✅ | In participant `runAgentMode` | 2026-10-15 |
| P2-16 | `/agent` command wiring + settings (`maxIterations`, `autoApprove`, `truncateKB`) + trust check + workspace-root requirement message | ✅ | Handler routes `/agent` → `runAgentMode` | 2026-10-15 |

### 3.4 Phase 2 Gate

- [x] US-3 core: multi-file agent loop with approvals — **live-verified** (read → patch → verify cycle)
- [x] US-8 core: denial path leaves files untouched (live test); destructive tools force prompts; untrusted workspaces deny mutations (unit tests)
- [x] Path-escape rejection tests green (6 tests)
- [x] Destructive-command detection tests green (cannot auto-approve)
- [x] 55/55 tests total; TSC clean; bundle builds
- [ ] **Manual F5 verification by user** — run `/agent` on a real task in the demo workspace
- 🔁 Documented changes: LangGraph tool adapter → AI SDK native loop (P2-05); `get_terminal_output` → direct capture (P2-12)

**Phase 2 status: 14/16 tasks ✅, 2 replaced by documented design decisions, 1 manual F5 awaiting user.**

---

## 4. Phase 3 — Planning Mode (`/plan`)

**Phase goal:** durable plan artifacts + step execution with human-in-the-loop.
**Demo script:** plan OAuth login → review → execute 3 steps → edit mid-flight → resume after reload → completion.

| ID | Task | Status | Evidence | Date |
|---|---|---|---|---|
| P3-01 | Resolve Q-1 (plans dir) with user; record in §8 | ⬜ | | |
| P3-02 | `src/agent/plan/artifact.ts`: format + writer + parser (`.cutad/plans/<slug>.md`); roundtrip tests | ⬜ | | |
| P3-03 | Plan generation: structured output (zod) from model → artifact; validation + repair loop | ⬜ | | |
| P3-04 | `src/agent/graphs/planGraph.ts`: generate → review interrupt → execute loop (per-step approval) → write-back | ⬜ | | |
| P3-05 | Interrupt/Command plumbing: resume API in `AgentRuntime`; approve / approve-all / edit / skip / abort decisions; unit + integration tests | ⬜ | | |
| P3-06 | Plan rendering in chat: checkboxes, step status, "Open plan file" button; progress lines during execution | ⬜ | | |
| P3-07 | Resume: window-reload continuity (plan file as durable state + graph re-entry); integration test | ⬜ | | |
| P3-08 | `/plan` and `/plan execute` command routing; manual-edit-respect test | ⬜ | | |

### Phase 3 Gate
- [ ] US-5 acceptance pass
- [ ] Reload-resume demo works (P3-07)
- [ ] Manual plan edit respected on re-run (P3-08)
- [ ] Approve-all path with 3+ step plan (P3-05)
- [ ] Tests: artifact roundtrip, interrupt/resume; demo performed

---

## 5. Phase 4 — Debug Mode (`/debug`)

**Phase goal:** debugging grounded in real runtime state.
**Demo script:** failing test → run → breakpoint → stopped-state read → root-cause explanation → patch proposal.

| ID | Task | Status | Evidence | Date |
|---|---|---|---|---|
| P4-01 | **S-7 spike:** DAP `customRequest` payload map: threads/stackTrace/scopes/variables on a sample debug session; document shapes | ⬜ | | |
| P4-02 | `src/tools/debug/getDebugState.ts`: active session, threads, stack, scopes, variables; breakpoints list; mocked-facade tests | ⬜ | | |
| P4-03 | Breakpoint tools: set/remove; launch config picker + `startDebugging` (approval-gated) | ⬜ | | |
| P4-04 | `run_tests` tool: Test API results + task fallback; output parsers; tests | ⬜ | | |
| P4-05 | `src/agent/graphs/debugGraph.ts`: collect → model ⇄ debug tools → explain + fix diff | ⬜ | | |
| P4-06 | Debug context section in assembler (only when session active/stopped) | ⬜ | | |
| P4-07 | Failure explainer UX: file:line refs, root cause, patch button; expression evaluation gated + read-only policy documented | ⬜ | | |
| P4-08 | `/debug` command wiring + graceful no-session/no-tests messages | ⬜ | | |

### Phase 4 Gate
- [ ] US-4 acceptance pass
- [ ] Live debugging demo (P4-02…05)
- [ ] No debug mutation without confirmation (mocked facade test)
- [ ] Graceful degradation verified (P4-08)
- [ ] Mapper/parser tests green; demo performed

---

## 6. Phase 5 — MCP (Client + Server)

**Phase goal:** consume external MCP servers + expose Cutad tools as MCP server.
**Demo script:** chat uses an external MCP tool; external client (Claude Code) edits file via Cutad server with approval; denial path.

### 6.1 Client

| ID | Task | Status | Evidence | Date |
|---|---|---|---|---|
| P5-01 | Config discovery: `.vscode/mcp.json`, user profile, `cutad.mcp.servers`; watcher + change events; schema validation | ⬜ | | |
| P5-02 | Transports: stdio (`StdioClientTransport`) + Streamable HTTP; connect/lifecycle/health/restart with backoff | ⬜ | | |
| P5-03 | Tool ingestion: `listTools` → dynamic ToolSpecs (`server_tool` namespacing), `readOnlyHint` mapping, dynamic updates | ⬜ | | |
| P5-04 | Auth flow for protected servers (prompt → SecretStorage keyed by server id); error surfacing per-tool | ⬜ | | |
| P5-05 | Integration test: in-process MCP server ↔ client roundtrip; crash/restart resilience test | ⬜ | | |

### 6.2 Server

| ID | Task | Status | Evidence | Date |
|---|---|---|---|---|
| P5-06 | `src/mcp/server/server.ts`: stdio MCP server exposing registry tools; `Cutad.AI: Start MCP Server` command | ⬜ | | |
| P5-07 | CLI entry `dist/mcp-server.js --stdio` + esbuild second entry; external client config docs snippet | ⬜ | | |
| P5-08 | Approval routing: mutating calls → VS Code modal naming the client; denial → MCP error; threat-model doc update | ⬜ | | |
| P5-09 | Resolve Q-4 (expose VS Code-specific tools?); implement decision; optional `registerMcpServerDefinitionProvider` self-registration | ⬜ | | |
| P5-10 | Resources/prompts P1: list resources, attach as context; prompts→slash commands P2 (stretch) | ⬜ | | |

### Phase 5 Gate
- [ ] US-6 + US-7 acceptance pass
- [ ] ≥ 3 real external servers consumed (documented list in §7)
- [ ] External client edit-through-approval demo + denial path (P5-08)
- [ ] Roundtrip + resilience tests green; demo performed

---

## 7. Phase 6 — Hardening & Release

**Phase goal:** marketplace-ready V1.0.

| ID | Task | Status | Evidence | Date |
|---|---|---|---|---|
| P6-01 | Performance pass: activation < 300ms (lazy imports), bundle < 5MB, memory steady-state; record numbers | ⬜ | | |
| P6-02 | Security review execution (checklist from ARCHITECTURE §6) + fixes; no P0/P1 open | ⬜ | | |
| P6-03 | Test matrix: Win/macOS/Linux × stable VS Code; manual QA script documented + executed | ⬜ | | |
| P6-04 | Docs: README, setup, MCP setup, troubleshooting, tested-models table | ⬜ | | |
| P6-05 | Marketplace assets: icon/banner/description/changelog; `vsce package` VSIX; publisher setup (Q-7) | ⬜ | | |
| P6-06 | Release criteria audit (PRD §11) + go/no-go review | ⬜ | | |

### Phase 6 Gate
- [ ] PRD §11 all checked; VSIX clean-profile smoke on 3 OSes
- [ ] Changelog + tag; demo performed

---

## 8. Decision Log (append-only, chronological)

| # | Date | Decision | Context | By |
|---|---|---|---|---|
| 1 | 2026-10-15 | D-01…D-11 locked (see PLANNING §1.1) | Initial planning session | User + AI |
| 2 | 2026-10-15 | Docs set v0.1 written (PRD/PLANNING/ARCHITECTURE/ROADMAP/STATE) | This session | AI |
| 3 | 2026-10-15 | No sub-agents during development (D-05) | Budget constraint stated by user | User |
| 4 | 2026-10-15 | **No mocks — real gateway for all testing.** Mock gateway deleted (P0-05 changed) | User directive: "never use mock" | User |
| 5 | 2026-10-15 | **Config source = `~/.cutad/config.json`** (home-basedir), holds API key + baseUrl + model + all settings. Supersedes SecretStorage-for-key plan (ADR-006 amended: key in home config file, chmod-protected on POSIX) | User directive: "put all .env on config json with location on homebasedir" | User |
| 6 | 2026-10-15 | **Default model = `workbuddy/deepseek-v4.1-flash`** (1M ctx, 20k max out, reasoning-capable) | User directive; verified live on gateway | User |
| 7 | 2026-10-15 | **S-1 RESOLVED: AI SDK 7 stays.** Extension host Node v24.21.0 ≥ 22 (Electron 43.7.7 in VS Code 1.141.1) | Binary evidence | AI |
| 8 | 2026-10-15 | **S-3 RESOLVED: bundling works.** LangGraph StateGraph + AI SDK run from esbuild CJS bundle | `dist/host-smoke.js` run | AI |
| 9 | 2026-10-15 | **S-4 RESOLVED: reasoning format.** Gateway emits `reasoning-start/delta/end` stream parts when `providerOptions: { cutad: { reasoningEffort } }` is passed (verified "high" → 51 reasoning deltas, separated from text). Without the option, reasoning is inline text. **Reasoning display depends on sending reasoningEffort.** | `dist/reasoning-spike.js` output | AI |
| 10 | 2026-10-15 | **IPv4-first DNS required** — IPv6 resolution to ai.cutad.web.id hangs (Connect Timeout). Fix: `setDefaultResultOrder("ipv4first")` in `src/llm/gateway.ts`. Do not remove. | Live failure + fix verified | AI |
| 11 | 2026-10-15 | **Phase 1 simplified scope:** chat path calls gateway directly (no LangGraph in hot path); LangChain `AiSdkChatModel` bridge (P1-05) and code-block actions (P1-18) deferred to Phase 2 where the graph + tool registry actually need them | Pragmatic vertical slice | AI |
| 12 | 2026-10-15 | **Agent loop = AI SDK native tool loop, not LangGraph** (supersedes P2-05/P2-13 as written). Rationale: AI SDK 7 `streamText` + `tool()` + `stopWhen: stepCountIs` provides the full model⇄tools loop with typed streaming events; wrapping it in a LangGraph node would add a second state machine with no benefit at this stage. **LangGraph remains the Phase 3 plan-execution engine** (state graph + interrupts for step approvals). | Architecture simplification; fewer moving parts | AI |
| 13 | 2026-10-15 | **`run_command` captures output directly** (spawn + stream capture), not via VS Code terminal shell integration. Simpler, works headless in tests. Terminal UX integration deferred to Phase 4 if needed. | Testability + simplicity | AI |
| — | — | *(append here as phases progress)* | | |

---

## 9. Blockers & Parking Lot

### Active Blockers
| # | Blocker | Impact | Owner | Resolution path |
|---|---|---|---|---|
| — | none yet | — | — | — |

### Parking Lot (deferred ideas, do not build now)
| # | Idea | Target | Note |
|---|---|---|---|
| PL-1 | Multi-provider BYO keys | V1.x | D-04 deferred |
| PL-2 | Checkpoint persistence (sqlite/file) | V1.x | ADR-007 |
| PL-3 | `registerLanguageModelChatProvider` (CutadAI models for all of VS Code) | V1.x | API verified exists |
| PL-4 | Custom webview dashboards | V2 | ADR-001 |
| PL-5 | Multi-agent supervisor/swarm | V2 | — |
| PL-6 | Inline chat integration | V2 | — |
| PL-7 | Remote/cloud agent | V3 | — |
| PL-8 | Team/enterprise config | V3 | — |

---

## 10. Reference: Tested External MCP Servers (fill during P5)

| Server | Transport | Tools used | Status | Date |
|---|---|---|---|---|
| *(to be filled during Phase 5)* | | | | |

---

## 11. Session Notes

| Date | Note |
|---|---|
| 2026-10-15 | Planning session: docs v0.1 written; stack verified (langgraph 1.5.0, ai 7.0.141, openai-compatible 3.0.69, mcp sdk 1.32.1); user decisions D-01…D-05 captured; awaiting review + "GO Phase 0". |
| 2026-10-15 | **Phase 0 executed (main session, no sub-agents).** Scaffold complete; deps installed (298 pkgs, 0 conflicts); S-1 passed (Node 24.21 in host → AI SDK 7 stays); S-3 passed (LangGraph+AI SDK bundle works); mock gateway deleted per user directive — **all tests run against real gateway**; config moved to `~/.cutad/config.json`; real-gateway test suite 5/5 green; extension builds at 3.4mb. Remaining: user F5 demo, S-4 reasoning shape (Phase 1), P0-09 framework choice (Phase 1 planning). |
| 2026-10-15 | **Phase 1 executed.** S-4 passed (reasoning via `reasoningEffort` provider option → separated reasoning deltas). IPv4-first DNS fix discovered + applied. Built: error taxonomy (12 kinds, unit-tested), budget manager (unit-tested), AgentEvent runtime, thinking-block renderer (unit-tested), context assembler, model picker, rate-limit status bar, follow-ups, mode notices, error action buttons. **29/29 tests green.** Deferred to P2: LangChain bridge (P1-05), code-block actions (P1-18). Awaiting user F5 demo. |
| 2026-10-15 | **Phase 2 executed.** Tool framework (ToolSpec + registry), 12 builtin tools (file/git/vscode), approval gate with policy engine + QuickPick UX, destructive-command detection (14 patterns), path-escape guard, agent loop (AI SDK native tool loop), LM Tools adapter + manifest codegen (12 entries), `/agent` wiring. **Live agent test green**: model read buggy `calc.ts`, applied `apply_patch` fix, verified — and denial path left file untouched. **55/55 tests green** (8 files). Decisions #12/#13: LangGraph deferred to Phase 3 (plan engine), run_command uses direct capture. Awaiting user F5 demo. |

---

*End of STATE v0.1 — keep this file updated; it is the single source of truth for progress.*
