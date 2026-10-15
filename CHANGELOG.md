# Changelog

All notable changes to Cutad.AI are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
- Approval gate on every mutation: Allow once / Always allow (session) / Deny; destructive commands (`rm -rf`, force push, `curl | sh`) can never be auto-approved
- Workspace-trust aware: all mutations disabled in untrusted workspaces

**Planning (`/plan`)**
- Durable plan artifacts (SQLite) with objective, files, and verification per step
- LangGraph execution graph with `interrupt()` per step: approve / approve-all / skip / abort
- Resume across window reloads via checkpointing; `/plan list`, `/plan execute`

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
- **Server**: expose Cutad tools via `dist/mcp-server.js` (stdio); `Cutad.AI: Start MCP Server`; in-editor mode routes mutations through the approval gate

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
