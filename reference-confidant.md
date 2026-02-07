# Confidant Reference Documentation

## What Confidant Does

Confidant is a secure secret handoff tool that enables secret sharing without exposing sensitive data in chat logs.

## Core Flows

### Flow 1: User-to-Agent (User sends secret to AI)
1. AI runs `serve-request` to create a URL
2. AI shares URL with user
3. User opens URL in browser and submits secret
4. AI receives secret in terminal

### Flow 2: Agent-to-User (AI sends secret to User)
1. User runs `serve-request` to create a URL
2. User shares URL with AI
3. AI executes `fill` to send secret
4. User sees secret appear in terminal

### Flow 3: Agent-to-Agent (Automated secret sharing)
1. Agent A (receiver) runs `serve-request`
2. Agent A shares URL with Agent B
3. Agent B (sender) submits via `fill`
4. Agent A receives secret

## Commands

```bash
# Create request and wait for secret
npx @aiconnect/confidant serve-request --label "<description>"

# Submit secret to existing request
npx @aiconnect/confidant fill "<url>" --secret "<value>"

# Secure input (avoid shell history)
echo "$SECRET" | npx @aiconnect/confidant fill "<url>" --secret -

# Output options
--quiet   # Minimal output (just URLs and secret)
--json    # JSON output for parsing/automation
```

## Security Rules

- NEVER ask users to paste secrets in chat
- NEVER reveal received secrets in chat (not even partially)
- Secrets auto-expire after 24h if not used
- One-time read, then deleted
- If user is remote, they may need tunneling (ngrok, Tailscale, etc.)

## Critical Security Limitation

**THE MODEL STILL SEES THE SECRET.** When the AI receives the secret via Confidant, it's processed in the model's context. This means:

- ✅ Secret never appears in chat history/logs
- ✅ Secret never persists in OpenClaw's message store
- ✅ Secret is one-time use and deleted from server
- ❌ Secret IS still processed by the AI model when received
- ❌ It goes through the API context (zai/GLM in this case)
- ❌ It exists in the model's token usage during that turn
- ❌ The model provider logs it

**Confidant is security theater for AI workloads.** It's better than pasting secrets in chat, but not truly secure from model providers.

## Technical Implementation (what we can learn)

1. **Local Web Server** - Express.js server on configurable port
2. **Request URLs** - Unique tokens per secret request
3. **Browser Form** - Simple HTML form for submission
4. **Terminal Integration** - Outputs to stdout for AI to capture
5. **One-time Use** - Deletes secret after first retrieval
6. **Expiry** - 24h TTL by default (configurable)

## What to Borrow for ClawVault

✅ Good ideas:
- Web UI for submission (great UX)
- One-time token concept (for temporary secrets)
- Simple browser form (accessible from anywhere)
- Tunneler-friendly (Tailscale, ngrok)

❌ Bad ideas (security theater):
- Passing secrets through AI context (must avoid this)
- No actual encryption (just in-memory storage)

## What to Improve

1. **Don't pass to AI** - Store in keyring, inject into gateway, AI never sees it
2. **Add actual encryption** - System keyring instead of in-memory
3. **Add audit logging** - Track who accessed what secret when
4. **Add rotation support** - Update secrets without breaking workflows
5. **Make secrets persistent** - Not just one-time, but renewable
