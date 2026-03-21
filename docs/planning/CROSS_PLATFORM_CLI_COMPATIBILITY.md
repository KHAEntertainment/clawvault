# Cross-platform CLI tool compatibility (Claude Code, Aider, etc.)

> **GitHub Issue Draft** — create as issue at https://github.com/KHAEntertainment/clawvault/issues/new

## Context

ClawVault was designed for OpenClaw's chat-channel agent model, where user interaction happens through platforms like Telegram. The `clawvault request` workflow — spinning up an ephemeral web server and sending a one-time link — works well when the agent can't directly prompt the user for input.

CLI coding tools like [Claude Code](https://docs.anthropic.com/en/docs/claude-code), Aider, and others operate differently: the user already has a terminal session. This opens up more direct interaction patterns that don't require a browser round-trip.

However, the web server flow remains essential — it's increasingly common to work on coding sessions remotely via features like `claude-remote`, where sessions run from a web browser or mobile device without a local terminal. The goal is to **add** terminal-native paths, not remove the existing browser-based flow.

This issue tracks investigation and implementation of cross-platform compatibility for terminal-based AI coding tools.

## Current Compatibility

What already works well with CLI tools:
- `clawvault add <name> --value "..." / --stdin` — non-interactive, pipe-friendly
- `clawvault list` — machine-parseable output
- `clawvault resolve` — exec-provider protocol (JSON stdin/stdout)
- `clawvault doctor` — diagnostics

What's awkward in a terminal context:
- `clawvault request` — launches a web server and prints a URL, expecting the user to context-switch to a browser
- No native way for a CLI tool to register as a "secret consumer" or get notified when secrets change

## Proposed Enhancements

### 1. Terminal-native secret input mode
**Priority: High**

Add a `--terminal` or `--interactive` flag (or auto-detect TTY) to `clawvault request` that falls back to a secure terminal prompt (`inquirer` hidden input) instead of launching a web server.

```bash
# Current (browser-based)
clawvault request OPENAI_API_KEY

# Proposed (terminal-based, auto-detected when TTY is present)
clawvault request OPENAI_API_KEY --terminal
# Or simply:
clawvault add OPENAI_API_KEY  # already supports interactive prompt
```

Alternatively, enhance `clawvault add` to cover the "request" use case more naturally in terminal contexts — it already supports hidden interactive input via inquirer.

### 2. MCP Server mode
**Priority: High**

Expose ClawVault as an [MCP (Model Context Protocol) server](https://modelcontextprotocol.io/) so CLI tools can integrate natively without shelling out.

```json
// Claude Code MCP config (~/.claude/settings.json)
{
  "mcpServers": {
    "clawvault": {
      "command": "clawvault",
      "args": ["mcp-serve"],
      "env": {}
    }
  }
}
```

Exposed MCP tools:
- `clawvault_list` — list stored secret names (metadata only)
- `clawvault_has` — check if a secret exists
- `clawvault_add` — store a secret (with user approval via MCP confirmation flow)
- `clawvault_remove` — delete a secret (**requires human-in-the-loop confirmation; see Security section below**)
- `clawvault_doctor` — run diagnostics
- `clawvault_request` — generate a one-time submission link (fallback for non-TTY / remote / web sessions)

**Security note:** `clawvault_get`/resolve should NOT be an MCP tool — this preserves the "secrets never enter AI context" guarantee. The exec-provider protocol remains the only path for secret resolution.

### 3. Context-aware execution mode detection
**Priority: Medium**

Auto-detect the execution environment and adjust behavior:

| Signal | Detected Context | Behavior |
|--------|-----------------|----------|
| `process.stdout.isTTY === true` | Interactive terminal | Use inquirer prompts |
| `process.stdin.isTTY === false` | Piped/scripted | Expect `--value` or `--stdin` |
| `MCP_SERVER=1` or launched via stdio | MCP server mode | JSON-RPC protocol |
| Neither TTY nor pipe | Chat/remote agent | Web server + URL (current behavior) |
| Remote/web session (claude-remote, etc.) | No local terminal | Web server + URL (current behavior) |

### 4. Claude Code hooks integration
**Priority: Medium**

Provide documented hook configurations for Claude Code that auto-check secret availability before operations that need them:

```json
// .claude/settings.json hooks example
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{
          "type": "command",
          "command": "clawvault doctor --quiet --exit-code"
        }]
      }
    ]
  }
}
```

### 5. Structured output mode
**Priority: Low**

Add `--json` flag to all commands for machine-parseable output, making integration with any CLI tool straightforward:

```bash
clawvault list --json
# {"secrets": [{"name": "OPENAI_API_KEY", "provider": "openai", "hasValue": true}]}

clawvault doctor --json
# {"platform": "linux", "provider": "gnome-keyring", "status": "ok", "issues": []}
```

### 6. Agent skill documentation for CLI tools
**Priority: Low**

Create a `CLAUDE.md` or equivalent skill file at the repo root that CLI agents automatically pick up, documenting available commands and the security contract. A version of this exists in `.clawhub/SKILL.md` but could be adapted for the Claude Code `CLAUDE.md` convention and other tools' equivalents.

## Security Considerations

### Destructive operations via MCP require human-in-the-loop

`clawvault_remove` (secret deletion) is a destructive, potentially irreversible operation. When exposed via MCP, it **must** require explicit human confirmation before execution. Options:

- **MCP-native confirmation:** Use the MCP protocol's built-in user confirmation flow so the host tool (Claude Code, etc.) prompts the user before executing
- **Two-factor confirmation:** For high-value secrets, require a secondary confirmation channel (e.g., confirm via the web UI, a TOTP code, or re-authentication against the OS keyring)
- **Soft delete / cooldown:** Instead of immediate deletion, mark secrets as "pending deletion" with a configurable cooldown period (e.g., 5 minutes) during which the operation can be cancelled
- **Audit + notification:** All delete operations should be prominently logged and optionally trigger a notification

This is especially important in remote/web sessions where an agent could be operating with less direct oversight.

### Secrets never enter AI context

This remains the core invariant regardless of integration mode. The MCP server must not expose any tool that returns secret values. The exec-provider protocol (`clawvault resolve`) is the only sanctioned path for secret resolution, and it operates outside AI context by design.

## Non-goals

- **Exposing `get()`/secret values via MCP** — breaks the core security guarantee
- **Replacing the web UI** — the browser-based flow remains valuable for chat-channel agents, remote sessions (claude-remote), mobile access, and headless scenarios

## Suggested implementation order

1. Structured output (`--json`) — small, unblocks tooling integration
2. Context detection (TTY/pipe/MCP) — foundation for adaptive behavior
3. MCP server mode (with HITL guardrails for destructive ops) — highest impact for Claude Code integration
4. Terminal-native request flow — UX improvement for interactive terminal use
5. Hooks documentation — adoption enablement
6. Agent skill docs — discoverability
