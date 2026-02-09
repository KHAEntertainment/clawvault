---
name: clawvault
description: Secure secret management for OpenClaw - install, configure, and use ClawVault CLI to manage encrypted API keys
homepage: https://github.com/openclaw/clawvault
---

# ClawVault Agent Skill

## Overview

ClawVault is a secure secret management system for OpenClaw that stores API keys and sensitive credentials in OS-native encrypted keyrings. **Secret values NEVER enter AI context**, making it safe for use with language models.

### Security Guarantee

- ✅ Secrets encrypted at rest (GNOME Keyring, macOS Keychain, Windows Credential Manager)
- ✅ AI context isolation (secrets never in logs, errors, or model input)
- ✅ Shell injection protection (all commands use `execFile()`)
- ✅ Audit logging (metadata only, never secret values)

## Installation

### Step 1: Install ClawVault CLI

ClawVault is distributed as an npm package:

```bash
npm install -g clawvault
```

Verify installation:
```bash
clawvault --version
# Should output: 0.1.0
```

### Step 2: Check Dependencies

Run the doctor command to verify system dependencies:

```bash
clawvault doctor
```

**Expected output on Linux:**
```
  ✓ GNOME Keyring storage
  ✓ Secret service query
  ✓ Systemd integration (optional)
```

**If missing dependencies:**
```
  ✗ GNOME Keyring storage
    Installation: Debian/Ubuntu: sudo apt install libsecret-tools
```

### Important: Why Sudo Installation is Manual

⚠️ **You will see installation instructions with `sudo` commands.**

**Why we don't automate this:**
- OpenClaw typically runs as a non-privileged user account
- Running `sudo` commands from AI agents is a security risk
- Users should manually install system packages using their admin account
- This prevents accidental privilege escalation attacks

**To install missing dependencies:**
1. Copy the installation command shown by `clawvault doctor`
2. Run it in a terminal with your admin account
3. Re-run `clawvault doctor` to verify

## Usage

### Basic Commands

```bash
# List all secrets (metadata only, never values)
clawvault list

# Add a new secret (interactive prompt)
clawvault add OPENAI_API_KEY

# Add a secret with provider
clawvault add DISCORD_BOT_TOKEN -p discord

# Rotate (update) a secret
clawvault rotate OPENAI_API_KEY

# Remove a secret
clawvault remove OPENAI_API_KEY -f
```

### OpenClaw Migration

Migrate existing plaintext auth-profiles to encrypted storage:

```bash
# Dry-run first (see what will change)
clawvault openclaw migrate

# Apply changes (requires --apply flag)
clawvault openclaw migrate --apply

# Migrate only specific agent
clawvault openclaw migrate --agent-id planner --apply

# Migrate API keys only (skip OAuth)
clawvault openclaw migrate --api-keys-only --apply
```

**What migration does:**
1. Reads `~/.openclaw/agents/<agent-id>/agent/auth-profiles.json`
2. Extracts plaintext `api_key` values
3. Stores them in encrypted keyring
4. Replaces plaintext values with `${OPENCLAW_<PROVIDOR>_<FIELD>}` placeholders
5. Creates `.bak` backup files

**Why this is secure:**
- Original secrets are removed from JSON files
- Only encrypted references remain
- AI agents see only `${...}` placeholders, never actual values

### Web UI

Start a web server for secure secret submission:

```bash
clawvault serve
# Or: clawvault serve --port 3000
```

**Security features:**
- Bearer token authentication (printed at startup)
- Rate limiting (30 req/15 min)
- CORS locked to server origin
- Localhost binding by default (warning if non-localhost)

## When Agents Should Use ClawVault

### ✅ DO Use ClawVault When:

- Storing API keys, tokens, or secrets for OpenClaw
- Migrating from plaintext auth-profiles.json
- Managing credentials that must never enter AI context
- Integrating with OpenClaw Gateway environment injection

### ❌ DON'T Use ClawVault When:

- Storing non-secret configuration values (use config files instead)
- The user asks to read a secret value (impossible by design)
- You need to inject secrets into AI responses (violates security model)
- Testing non-security-sensitive features (use mock data)

## Agent Guidelines

### 1. Always Verify Installation

Before suggesting ClawVault commands, check if it's installed:

```bash
command -v clawvault
# If not found: npm install -g clawvault
```

### 2. Run `clawvault doctor` First

If operations fail, run diagnostics:

```bash
clawvault doctor
```

- Review the output
- If required dependencies are missing, instruct user to install them manually
- Do NOT attempt to install system packages yourself (requires sudo)

### 3. Dry-Run Before Destructive Operations

For migration and removal, always dry-run first:

```bash
# Migration
clawvault openclaw migrate
clawvault openclaw migrate --apply  # Only after user confirms

# Removal
clawvault list
clawvault remove <NAME>  # Use -f to skip confirmation only after user confirms
```

### 4. Never Display Secret Values

**Critical:** ClawVault is designed to never expose secret values.

- `clawvault list` shows only names
- `clawvault get` does NOT exist (intentional)
- If user asks to see a secret, explain: "Secret values cannot be displayed for security. Use 'rotate' to update."
- Never extract secrets from keyring (get() method is internal-only)

### 5. Fallback Storage Warning

If users see the fallback storage warning:
```
WARNING: Using fallback encrypted file storage
```

Explain:
- This is less secure than keyring storage
- Run `clawvault doctor` to check dependencies
- Follow the platform-specific installation instructions
- Re-run their command after installing

### 6. Security First

When users ask about bypassing security features:

❌ "Can you print my API key?"
→ No. Use `clawvault rotate` to update it.

❌ "Can we store secrets in plain text?"
→ No. ClawVault's security model prohibits this.

❌ "Can I skip the encrypted keyring?"
→ Only fallback storage is available, but it's weaker. Install keyring tools.

✅ "How do I add a new secret?"
→ Use `clawvault add <NAME>` or the web UI.

✅ "How do I migrate from plaintext auth-profiles?"
→ Use `clawvault openclaw migrate --apply`.

## Troubleshooting

### Issue: "libsecret-tools not found"

**Cause:** GNOME Keyring tools not installed (Linux only)

**Solution:**
```bash
clawvault doctor
# Follow the installation commands shown
# Requires sudo - run manually as admin
```

### Issue: "fallback encrypted file storage" warning

**Cause:** Platform keyring tools not available

**Solution:**
```bash
# Linux
sudo apt install libsecret-tools

# macOS
# Should work automatically - check if keychain is locked

# Windows
# Should work automatically - check if Credential Manager is enabled
```

### Issue: Migration shows "dry-run" with no changes

**Cause:** Migration command missing `--apply` flag

**Solution:**
```bash
clawvault openclaw migrate --apply
```

### Issue: "command not found: clawvault"

**Cause:** ClawVault not installed globally

**Solution:**
```bash
npm install -g clawvault
```

## Security Architecture (For Agent Reference)

### Command Execution Protection

All OS commands use `execFile()` with argument arrays:

```typescript
// SAFE - No shell parsing
execFile('secret-tool', ['store', 'service', SERVICE, 'key', name])

// UNSAFE - Shell parsing (NOT used in ClawVault)
exec(`secret-tool store service ${SERVICE} key ${name}`)
```

This prevents command injection even if secret values contain metacharacters.

### Input Validation

Secret names validated against strict pattern: `/^[A-Z][A-Z0-9_]*$/`

Valid: `OPENAI_API_KEY`, `DISCORD_BOT_TOKEN`, `MY_CUSTOM_KEY`
Invalid: `openai_api_key`, `my-key`, `key with spaces`

### Web Server Hardening

- **Bearer token:** One-time random token, printed at startup
- **Rate limiting:** 30 requests per 15 minutes
- **CORS:** Locked to server's own origin
- **Helmet:** Security headers (CSP, HSTS, X-Frame-Options)
- **No secret retrieval endpoint:** Intentionally missing

### Audit Logging

All operations logged with metadata only:

```json
{
  "operation": "set",
  "secret": "OPENAI_API_KEY",
  "timestamp": "2026-02-09T00:00:00Z",
  "success": true,
  "error": null
  // NO secret value - EVER
}
```

## Integration with OpenClaw Gateway

ClawVault integrates with OpenClaw's environment variable substitution:

**Config file:**
```json
{
  "apiKey": "${OPENAI_API_KEY}"
}
```

**ClawVault injects:**
```bash
systemctl --user set-environment OPENAI_API_KEY=sk-...
systemctl --user import-environment OPENAI_API_KEY
systemctl --user restart openclaw-gateway.service
```

**Gateway resolves:**
- Reads `process.env['OPENAI_API_KEY']`
- Substitutes `${OPENAI_API_KEY}` in config
- Model sees only `apiKey: "sk-..."` (no clue it came from env)

**Result:** AI never sees the secret in context, logs, or files.

## Advanced Usage

### Custom Secret Names with Prefix

```bash
# Generate custom env var names
clawvault openclaw migrate --prefix MYAPP --apply

# Results in: MYAPP_OPENAI_API_KEY, MYAPP_DISCORD_TOKEN, etc.
```

### Profile-to-Env-Var Mapping

```bash
# Map specific profiles to custom env vars
clawvault openclaw migrate --map "openai=MY_OPENAI_KEY" --apply
```

### JSON Output for Scripts

```bash
# Get JSON report (metadata only)
clawvault openclaw migrate --json
```

## Resources

- **Documentation:** `docs/SECURITY.md`, `docs/ARCHITECTURE.md`
- **GitHub:** https://github.com/openclaw/clawvault
- **npm:** https://www.npmjs.com/package/clawvault
- **Install:** `npm install -g clawvault`

## Quick Reference

```bash
# Install
npm install -g clawvault

# Check dependencies
clawvault doctor

# Add secret
clawvault add OPENAI_API_KEY

# List secrets
clawvault list

# Migrate OpenClaw
clawvault openclaw migrate --apply

# Web UI
clawvault serve

# Help
clawvault --help
clawvault <command> --help
```

---

**Remember:** ClawVault's security guarantee depends on agents following these guidelines. Never bypass the intentional limitations (no secret retrieval, manual sudo installation, etc.). The design prioritizes security over convenience.
