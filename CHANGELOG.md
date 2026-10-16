# Changelog

All notable changes to Cutad.AI are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] — 2026-10-16

Security and reliability release. A full code audit identified 33 issues (5 critical); this release fixes 30 of them with regression tests. All users should update.

### Added

- **In-editor MCP server** (new, recommended): `Cutad.AI: Start MCP Server` now offers a localhost HTTP endpoint (`http://127.0.0.1:3987/mcp`) where **every mutating tool prompts you in VS Code** through the approval gate before running. Configurable via `cutad.mcp.port`.
- **Session resume**: after a window reload, the extension resumes the most recent session for the workspace (within 12 hours) instead of starting fresh — plan list, memory counters, and history stay connected.
- **Model-aware context budgeting**: the context window is now read from `/v1/models` (cached per gateway) instead of a hardcoded 200k, so 1M-context models use their full capacity and small models don't overflow.
- **Token usage display**: each turn now shows input/output/thinking tokens.
- **`/help` session stats**: tool usage table, delegation counts, and memory counters.
- **`agent.learnSkills` config toggle** (default `true`) to control automatic skill learning.
- **MCP env placeholder resolution**: `${VAR}` in MCP `env`, `args`, and `headers` configs is now expanded from the environment.

### Fixed

- **Destructive commands can no longer be silently auto-approved** (critical). The destructive-command detector was previously dead code; it is now wired into the approval flow — `rm -rf`, `git reset --hard`, force-pushes and `curl | sh` always force an explicit prompt, even for session-allowed tools.
- **Sub-agent delegations now prompt through the real approval gate** (critical). Previously, delegated specialists could execute mutating tools (including shell commands via the tester) without any approval prompt.
- **Accurate denial and failure accounting** (critical): denied actions now count as denials (not successes), failed patches no longer appear in "Files changed", and plan steps where the user denied every action are correctly marked as not done.
- **Tester specialist can no longer run arbitrary shell commands** — its tool subset was restricted to `run_tests` and read-only tools.
- **`/plan` outputs are now saved to session history** (previously missing), and turn state is always cleaned up even when a mode fails.
- **`Open Plan` reads from the session database** (previously looked in a stale workspace path and always found nothing).
- **MCP reconnect no longer leaves stale tools registered** — tools are unregistered on disconnect/reconnect, so renamed servers don't produce ghost tools.
- **MCP tools now expose their real input schema to the agent** (previously empty), so the model can call them with correct arguments.
- **MCP stdio servers no longer deadlock** when they write to stderr (pipe is now drained to the output channel).
- **Temp workspaces are cleaned up on deactivate** (previously accumulated forever).
- **Rate-limit reset values are unit-normalized** (seconds vs milliseconds).
- **CI live-gateway tests now actually run** when a key secret is configured (condition was previously always false).
- Plan re-execution after completion starts a fresh execution thread instead of reusing a finished checkpoint.
- Text-only plan steps (no tool calls) now count as successful instead of failing.
- Multiple smaller fixes: dead code removal, approval detail in prompts, `learnSkills` toggle documented, global MCP config fallback, package metadata (repository/homepage/bugs).

### Changed

- **README corrected**: the in-editor MCP server with approval routing now exists (previously the README described it but only the auto-approving standalone mode was shipped); plan reload-resume is documented as step-level (not checkpoint-level).

### Notes

- The standalone MCP server (`dist/mcp-server.js`) still auto-approves with a stderr warning — use the in-editor mode for interactive work, or standalone only in trusted workspaces.

---

## [0.1.0] — 2026-10-15

First release. All four modes, agent intelligence layer, and MCP in both directions.

### Added

**Chat (`@cutad`)**
- Streaming markdown answers with collapsible reasoning/thinking display (when the model supports it)
- Workspace context assembly: active file/selection, `#`-referenced files, diagnostics — with token budget and explicit omission notes
- 6-turn conversation history, follow-up suggestions, rate-limit status bar
- Full gateway error taxonomy (12 kinds) with actionable action buttons

**Coding Agent (`/agent`)**
- Autonomous tool loop: reads, edits, runs commands, verifies — bounded iterations, cancellation
- 20 built-in tools: file read/write/patch, search, git, terminal, diagnostics, debug state, tests, skills, delegation
- Approval gate on every mutation: Allow once / Always allow (session) / Deny
- Workspace-trust aware: all mutations disabled in untrusted workspaces

**Planning (`/plan`)**
- Durable plan artifacts (SQLite) with objective, files, and verification per step
- LangGraph execution graph with `interrupt()` per step: approve / approve-all / skip / abort
- In-session resume via checkpointing; `/plan list`, `/plan execute`

**Debug (`/debug`)**
- Real debugger state via DAP: threads, stack frames, scopes, variables at a breakpoint
- Breakpoint tools (list/set/remove) and `launch_debug` with launch-config discovery
- `run_tests`: auto-detects npm/pytest/cargo/go; parses vitest/jest, mocha, pytest, cargo output with failure extraction

**Agent Intelligence**
- 4 read-only sub-agent specialists: explorer, researcher, reviewer, tester — via `delegate_to_specialist`
- 25 built-in skills as markdown playbooks (`~/.cutad/skills/`) with objective + goals + triggers, auto-matched and injected into context
- Skill creator tools (`list/read/create/delete`); auto-learning of reusable procedures from completed sessions

**MCP — both directions**
- **Client**: consume external MCP servers from `.vscode/mcp.json`, `.mcp.json`, or `~/.cutad/mcp.json`; stdio + Streamable HTTP; namespaced tools; `/mcp` status
- **Server**: expose Cutad tools via `dist/mcp-server.js` (stdio); `Cutad.AI: Start MCP Server`

**Storage**
- SQLite (`~/.cutad/cutad.db`): sessions, messages, memory, knowledge, tool usage, plans
- Per-session JSON memory state (`~/.cutad/sessions/<id>/state.json`)
- Session scratch workspaces in the OS temp dir

**Configuration**
- `~/.cutad/config.json` (home-basedir): API key, base URL, model, reasoning effort, agent limits, auto-approve list

### Notes
- Requires a CutadAI API key (`cag_...`) and VS Code 1.140+
- IPv4-first DNS resolution is applied automatically for gateway connectivity
- Standalone MCP server mode has no approval UI and auto-approves mutations — use only in trusted workspaces
