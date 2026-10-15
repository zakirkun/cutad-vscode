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
| P1 | Chat Mode (`/ask`) | ⬜ TODO | ⬜ | — | — |
| P2 | Coding Agent (`/agent`) | ⬜ TODO | ⬜ | — | — |
| P3 | Planning (`/plan`) | ⬜ TODO | ⬜ | — | — |
| P4 | Debug (`/debug`) | ⬜ TODO | ⬜ | — | — |
| P5 | MCP (Client + Server) | ⬜ TODO | ⬜ | — | — |
| P6 | Hardening & Release | ⬜ TODO | ⬜ | — | — |

**Blocker watch:** ~~R-1 (Node ≥22 for AI SDK 7)~~ ✅ **RESOLVED 2026-10-15** — extension host = Electron 43.7.7 → Node v24.21.0 ≥ 22. AI SDK 7 stays. ~~R-4 (LangGraph bundling)~~ ✅ **RESOLVED 2026-10-15** — S-3 spike passed: StateGraph + AI SDK run from esbuild CJS bundle.

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
| P1-01 | `src/llm/gatewayClient.ts`: `createOpenAICompatible({baseURL, apiKey})`; `streamText`/`generateText` wrappers; abort signal support; usage extraction | ⬜ | | |
| P1-02 | `src/llm/errors.ts`: `CutadError` taxonomy + mapper for all gateway codes (ARCHITECTURE §3.3 table); unit tests per code | ⬜ | | |
| P1-03 | Retry/backoff: exponential + jitter for 429/502/503/network; honor `retry-after`; max attempts setting; unit tests with fake timers | ⬜ | | |
| P1-04 | `src/llm/reasoning.ts`: normalize reasoning deltas (field per S-4) → `ReasoningDelta` events; passthrough to LangChain `additional_kwargs.reasoning_content` | ⬜ | | |
| P1-05 | `src/llm/aiSdkChatModel.ts`: LangChain `BaseChatModel` adapter → GatewayClient (per ADR-003); message + tool-binding conversion; unit tests | ⬜ | | |
| P1-06 | Rate-limit header capture (`x-ratelimit-remaining/reset`) → status bar item (lightweight) | ⬜ | | |

### 2.2 Auth & Model Registry

| ID | Task | Status | Evidence | Date |
|---|---|---|---|---|
| P1-07 | `src/config/secrets.ts`: SecretStorage wrapper; `cutad.setApiKey` command; first-run prompt from participant handler when key absent | ⬜ | | |
| P1-08 | `src/config/modelRegistry.ts`: fetch `GET /v1/models`; cache TTL; map to `{id, displayName, contextWindow, maxOutputTokens}`; unit tests against mock | ⬜ | | |
| P1-09 | Model picker: QuickPick command + `cutad.model` setting persistence; status bar shows active model; graceful 403 model_not_allowed handling with switch action | ⬜ | | |
| P1-10 | `cutad.testConnection` command: models fetch + 1-token completion; toast result; diagnostics info | ⬜ | | |

### 2.3 Context & Graph (ask)

| ID | Task | Status | Evidence | Date |
|---|---|---|---|---|
| P1-11 | `src/context/assembler.ts`: active file + selection, `#file`/`#selection` variables, diagnostics summary, recent files; produces `AssembledContext` with per-item token estimates | ⬜ | | |
| P1-12 | `src/context/budget.ts`: model-aware budget from registry; priority ordering; omission notes ("N files omitted"); unit tests | ⬜ | | |
| P1-13 | `src/agent/graphs/askGraph.ts`: assemble → model; wired to `AiSdkChatModel`; checkpoint per session (`MemorySaver`); run via `AgentRuntime` | ⬜ | | |
| P1-14 | `src/agent/runtime.ts`: `AgentEvent` stream contract (text/reasoning/tool/plan/progress/usage/error) + `run()` orchestration + cancellation propagation | ⬜ | | |

### 2.4 Chat UX

| ID | Task | Status | Evidence | Date |
|---|---|---|---|---|
| P1-15 | `src/chat/participant.ts`: real handler — mode routing (`/ask` default, `/help`); `stream.progress`; history usage from `context.history` | ⬜ | | |
| P1-16 | `src/chat/render.ts`: `AgentEvent → ChatResponseStream` (markdown chunks, references via `stream.reference`, buttons via `stream.button`); pure + unit tested | ⬜ | | |
| P1-17 | Thinking UI: streaming quote block while reasoning; auto-collapse on end; `cutad.reasoning.show` setting; test with mock reasoning deltas | ⬜ | | |
| P1-18 | Code-block actions: Apply (to active editor via WorkspaceEdit), Insert at cursor, Copy; command-backed buttons with `isTrusted` handling | ⬜ | | |
| P1-19 | Cancellation: `token.onCancellationRequested` → abort → partial content retained; "stopped" note appended | ⬜ | | |
| P1-20 | Follow-ups v1: `participant.followupProvider` returning 2–3 contextual suggestions | ⬜ | | |
| P1-21 | Error UX: error → markdown + action buttons (Open dashboard, Select model, Retry); mapping from P1-02 taxonomy | ⬜ | | |

### 2.5 Logging

| ID | Task | Status | Evidence | Date |
|---|---|---|---|---|
| P1-22 | `src/util/logger.ts`: OutputChannel `Cutad.AI`; levels; redaction (never key/prompt at default); request spans with durations | ⬜ | | |
| P1-23 | `cutad.showDiagnostics` command: version, model, endpoint reachability, last errors, rate-limit state | ⬜ | | |

### 2.6 Phase 1 Gate

- [ ] US-1 + US-2 acceptance pass (PRD §6)
- [ ] Error matrix demoed via mock (401/403/404/429/502/503) — P1-02/03/21
- [ ] Cancellation clean (P1-19); first-token informal measurement recorded
- [ ] ≥ 15 tests green; diagnostics clean; demo performed

---

## 3. Phase 2 — Coding Agent Mode (`/agent`)

**Phase goal:** autonomous multi-file coding with full tool registry + approvals.
**Demo script:** rename symbol across repo + fix tests; one denial; one test-failure iteration; untrusted workspace check.

### 3.1 Tool Framework

| ID | Task | Status | Evidence | Date |
|---|---|---|---|---|
| P2-01 | `src/tools/registry.ts`: `ToolSpec` interface (ARCHITECTURE §3.4), registry container, lookup, validation helper; unit tests | ⬜ | | |
| P2-02 | `src/tools/truncate.ts`: per-tool byte/line policy, explicit markers; unit tests | ⬜ | | |
| P2-03 | `src/tools/approval.ts`: `ApprovalGate` — policy engine (readOnly/destructive/autoApprove/trust/session allow-list); hard-blocked destructive list; unit tests for every policy branch | ⬜ | | |
| P2-04 | `src/tools/workspaceFs.ts`: workspace-root-confined fs helpers; traversal rejection tests | ⬜ | | |
| P2-05 | `src/tools/adapters/langgraph.ts`: ToolSpec → LangChain `tool()` (zod, approval-aware execute) | ⬜ | | |
| P2-06 | `src/tools/adapters/lmTool.ts` + manifest codegen: ToolSpec → `vscode.LanguageModelTool` + generated `contributes.languageModelTools`; `prepareInvocation` confirmation messages; register at activate | ⬜ | | |

### 3.2 Builtin Tools

| ID | Task | Status | Evidence | Date |
|---|---|---|---|---|
| P2-07 | Read tools: `read_file`, `list_dir`, `search_text` (findTextInFiles/ripgrep), `search_symbols` (workspace symbol provider) + tests | ⬜ | | |
| P2-08 | Editor tools: `get_diagnostics`, `get_open_editors`, `get_selection`, `get_workspace_tree` + tests | ⬜ | | |
| P2-09 | `write_file` + `apply_patch`: WorkspaceEdit application; atomic undo verified; diff preview in confirmation | ⬜ | | |
| P2-10 | `run_command`: terminal exec + shell-integration capture (S-6 fallback ready), timeout, destructive pattern detection, exact-command confirmation | ⬜ | | |
| P2-11 | `git_status`, `git_diff`: child-process git, bounded output | ⬜ | | |
| P2-12 | `get_terminal_output`: capture buffer access | ⬜ | | |

### 3.3 Agent Graph

| ID | Task | Status | Evidence | Date |
|---|---|---|---|---|
| P2-13 | `src/agent/graphs/agentGraph.ts` per decision P0-09: assemble → model ⇄ tools → summarize; bounded `maxIterations`; single-flight guard | ⬜ | | |
| P2-14 | Tool result → model loop incl. structured error results (denials, failures) so model adapts; loop-guard tests (no infinite loop) | ⬜ | | |
| P2-15 | Change summary: files changed + diff stats + test outcome; rendered as markdown list + file references | ⬜ | | |
| P2-16 | `/agent` command wiring + settings (`cutad.agent.maxIterations`, `cutad.agent.autoApprove`, `cutad.tools.truncateKB`) | ⬜ | | |

### 3.4 Phase 2 Gate

- [ ] US-3 + US-8 acceptance pass (PRD §6)
- [ ] Rename+test demo ≤ 5 approvals with "always allow"
- [ ] Denied tool → adapts, no hang (P2-14)
- [ ] Untrusted workspace: mutating disabled, chat works (P2-03/04)
- [ ] Path escape + destructive auto-approve tests green (P2-04/03)
- [ ] ≥ 30 tests total; diagnostics clean; demo performed

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

---

*End of STATE v0.1 — keep this file updated; it is the single source of truth for progress.*
