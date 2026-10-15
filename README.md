# Cutad.AI — AI Coding, Debugging & Planning for VS Code

An AI assistant that codes, debugs, and plans inside VS Code — powered by the [CutadAI model gateway](https://ai.cutad.web.id/docs), with agent orchestration, sub-agent specialists, 25 built-in skills, and MCP in both directions.

```
@cutad what does this repo do?              ← chat with reasoning display
@cutad /agent fix the failing tests         ← autonomous coding with approvals
@cutad /plan add OAuth login                ← durable plans with step approval
@cutad /debug why does auth.spec.ts fail?   ← real debugger + test state
```

---

## Quick start

1. **Install** the extension (VSIX or Marketplace).
2. **Set your API key** — command palette → **Cutad.AI: Set API Key** (or edit `~/.cutad/config.json`).
3. **Chat** — open the Chat view (`Ctrl+Alt+I`) and type `@cutad hello`.

The key is stored in `~/.cutad/config.json` (home directory, outside any repo). Get a key at [ai.cutad.web.id](https://ai.cutad.web.id/dashboard/keys).

## Commands

| Command | What it does |
|---|---|
| `@cutad <question>` | Chat with workspace context + reasoning display |
| `@cutad /agent <task>` | Autonomous coding: reads, edits, runs commands, verifies — every mutation approved |
| `@cutad /plan <goal>` | Generate a durable plan; `/plan execute` runs it step-by-step |
| `@cutad /debug <problem>` | Investigate failures using real debugger + test state |
| `@cutad /skills` | List installed skills with objectives and usage |
| `@cutad /mcp` | Show MCP server connection status |
| `@cutad /help` | Command reference |

Palette commands: **Set API Key** · **Select Model** · **Test Connection** · **Open Config** · **Show Diagnostics** · **Start MCP Server** · **Reconnect MCP Servers** · **Open Plan**

## Features

### Chat with reasoning
Streams answers with the model's thinking shown in a collapsible block (when the model supports it). Context comes from your active file/selection, `#`-referenced files, and workspace diagnostics — with an explicit token budget and omission notes.

### Coding agent with approvals
Every mutating action (file writes, terminal commands, git operations) requires confirmation. Read-only tools run freely. Destructive commands (`rm -rf`, `git reset --hard`, force push, `curl | sh`) can never be auto-approved. In untrusted workspaces, all mutations are disabled.

### Planning mode
Plans are durable artifacts stored in SQLite with step-by-step execution, per-step approval, skip/abort, and resume across window reloads (LangGraph checkpointing).

### Debug mode
Reads **real runtime state** via the debug adapter: threads, stack frames, scopes, and variables at a breakpoint. Runs your test suite (auto-detects npm/pytest/cargo/go) and parses failures from vitest/jest/mocha/pytest/cargo output. Evidence-first: reproduce → read state → one hypothesis → fix root cause → verify.

### Sub-agent specialists
Delegate focused work to isolated specialists: **explorer** (map unfamiliar code), **researcher** (investigate dependencies), **reviewer** (independent diff review), **tester** (run verification). All read-only; the parent agent owns every mutation.

### 25 built-in skills
Markdown playbooks in `~/.cutad/skills/` — each with an objective, goals, and triggers. Matched automatically by your prompt and injected into the agent's context.

**Debugging · Code Review · Refactoring · Test Writing · Planning · API Integration · Error Handling · Security Review · Performance · TypeScript Strict · Git Workflow · Code Exploration · Dependency Management · Async & Concurrency · Data Modeling · CLI Development · Frontend & UI · Documentation · Release Management · Incident Response · Log & Output Analysis · Context Management · Tool Orchestration · Prompt Engineering · Skill Authoring**

Skills are plain markdown — edit them, delete them, or ask the agent to create new ones (`create_skill` tool). The agent also learns reusable procedures from completed sessions automatically.

### MCP — both directions

**Consume** external MCP servers — add them to `.vscode/mcp.json`, `.mcp.json`, or `~/.cutad/mcp.json`:

```json
{
  "servers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
    }
  }
}
```

**Expose** Cutad.AI's tools as an MCP server — **Cutad.AI: Start MCP Server**, or point external clients at `dist/mcp-server.js`:

```json
{
  "mcpServers": {
    "cutad": {
      "command": "node",
      "args": ["<extension-path>/dist/mcp-server.js", "--workspace", "<your-repo>"]
    }
  }
}
```

> In-editor mode routes mutations through the VS Code approval gate. Standalone mode has no UI and auto-approves — use it only in trusted workspaces.

### Built-in tools (20)
Read: `read_file` · `list_dir` · `search_text` · `find_files` · `get_workspace_tree` · `get_diagnostics` · `get_open_editors` · `get_selection` · `git_status` · `git_diff` · `get_debug_state` · `list_breakpoints` · `fetch_url` · `list_skills` · `read_skill`
Mutating (approval required): `apply_patch` · `write_file` · `run_command` · `run_tests` · `set_breakpoint` · `remove_breakpoint` · `launch_debug` · `create_skill` · `delete_skill` · `delegate_to_specialist`

## Configuration

All settings live in `~/.cutad/config.json`:

```json
{
  "apiKey": "cag_...",
  "baseUrl": "https://ai.cutad.web.id/v1",
  "model": "workbuddy/deepseek-v4.1-flash",
  "maxOutputTokens": 8192,
  "reasoning": { "show": true, "effort": "high" },
  "agent": { "maxIterations": 25, "autoApprove": [] },
  "tools": { "truncateKB": 64 },
  "telemetry": { "enabled": false }
}
```

## Storage

```
~/.cutad/
├── config.json          ← settings + API key
├── cutad.db             ← SQLite: sessions, messages, memory, knowledge, tool usage, plans
├── sessions/<id>/
│   └── state.json       ← per-session JSON state (counters, active plan, files changed)
├── skills/*.md          ← skill playbooks (edit freely)
└── mcp.json             ← optional global MCP server config
```

Session scratch files go to your OS temp dir (`%TEMP%/cutad/<id>/`), never into the workspace.

## Requirements

- VS Code 1.140+
- A CutadAI API key (`cag_...`) with an active plan

## Troubleshooting

| Symptom | Fix |
|---|---|
| "No API key configured" | Run **Cutad.AI: Set API Key** or edit `~/.cutad/config.json` |
| Connection timeout | The gateway needs IPv4 on some networks (handled automatically); check `cutad.baseUrl` |
| Model errors | Run **Cutad.AI: Select Model** to see models available to your plan |
| Rate limited | Wait for the window to reset (`/help` shows status bar quota); the client retries automatically with backoff |
| MCP server not connecting | Check `/mcp` for the error message; verify the command works in a terminal |

Diagnostics: **Cutad.AI: Show Diagnostics** opens the output channel with version, model, config path, and recent errors.

## License

MIT
