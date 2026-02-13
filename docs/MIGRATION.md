# Migration Guide

Migrate existing OpenClaw credentials from plaintext `auth-profiles.json` files to encrypted ClawVault storage.

## Overview

OpenClaw stores authentication profiles in JSON files like:
```
~/.openclaw/agents/<agent-id>/agent/auth-profiles.json
```

These files may contain **plaintext secrets**:
```json
{
  "profiles": {
    "openai:default": {
      "type": "api_key",
      "key": "sk-abc123..."
    }
  }
}
```

**The migration:**
1. Scans all auth-profiles.json files
2. Extracts plaintext secrets
3. Stores them in encrypted keyring (ClawVault)
4. Replaces values with `${ENV_VAR}` placeholders
5. Creates backups before any changes

**Intended result (not currently supported by OpenClaw):**
```json
{
  "profiles": {
    "openai:default": {
      "type": "api_key",
      "key": "${OPENCLAW_OPENAI_OPENAI_DEFAULT_KEY}"
    }
  }
}
```

OpenClaw does not expand `${...}` placeholders in `auth-profiles.json` today. See the critical limitation section below.

---

## ⚠️ Critical Limitation: OpenClaw does *not* expand ${ENV_VAR} in auth-profiles.json

Today, **OpenClaw treats `${ENV_VAR}` strings in `auth-profiles.json` as literal text** — it does not perform environment-variable substitution when reading credentials.

**What this means:**
- Running `clawvault openclaw migrate --apply` will rewrite `auth-profiles.json` with `${...}` placeholders.
- OpenClaw will then try to use those placeholder strings as the actual credential value, and authentication will fail.

**Multi-agent pitfall:** if you have multiple agents, each agent has its own `auth-profiles.json`. A single "apply" migration can break all of them at once.

**OAuth is especially brittle:** even if OpenClaw gains env expansion in the future, OAuth token handling may validate/parse token-looking strings before expansion. Treat OAuth placeholder migration as unsupported.

**Recommendation:** use `clawvault openclaw migrate` as a **discovery/dry-run scanner only** until OpenClaw supports env-var substitution (or ClawVault gains a supported runtime integration path).

## Safe Migration Workflow

### Step 1: Simulate (Dry-Run)

**Always run this first.** Shows what will migrate without making changes.

```bash
clawvault openclaw migrate --verbose
```

**[Screenshot Placeholder: Dry-run output showing discovered secrets]**

Example output:
```
OpenClaw migration (dry-run)
No secrets were written and no files were modified.
Scanned: 2 auth store files
Files changed: 2
Secrets migrated: 8

main
  openai:default key → OPENCLAW_OPENAI_OPENAI_DEFAULT_KEY (49 chars)
  kimi-coding:default key → OPENCLAW_KIMI_CODING_KIMI_CODING_DEFAULT_KEY (72 chars)

planner
  openai:default key → OPENCLAW_OPENAI_OPENAI_DEFAULT_KEY (49 chars)
  ...

Re-run with --apply to write secrets to the keyring and update auth-profiles.json.
```

> **Note:** The above output reflects the actual CLI output. However, `--apply` is **not recommended** due to the critical limitation described above — OpenClaw does not expand environment variables in `auth-profiles.json`.

### Step 2: Generate Restore Command

**SAVE THIS COMMAND.** You'll need it if migration fails.

After `--apply`, the actual backup path will be printed. For now, the pattern is:

```bash
# Save this pattern - you'll get the exact path after migration
clawvault openclaw restore \
  "/home/openclaw/.openclaw/agents/main/agent/auth-profiles.json.bak.TIMESTAMP" \
  --yes
```

**[Screenshot Placeholder: Terminal with restore command highlighted]**

**⚠️ CRITICAL: Save this command in a safe place before proceeding.**

### Step 3: Review and Confirm

Check the dry-run output:
- Are the expected secrets listed?
- Are the ENV var names acceptable?
- Is the count correct?

### Step 4: Apply Migration

**⚠️ Not recommended right now.** See the critical limitation above: OpenClaw will not expand `${ENV_VAR}` placeholders from `auth-profiles.json`.

Only run this if you're intentionally rewriting the file for a custom runtime that *does* expand placeholders.

```bash
clawvault openclaw migrate --apply --verbose
```

**[Screenshot Placeholder: Apply migration output with backup paths]**

What happens:
1. ✅ Creates `.bak.TIMESTAMP` backup of each auth-profiles.json
2. ✅ Migrates secrets to ClawVault (encrypted)
3. ✅ Updates JSON files with `${ENV_VAR}` placeholders
4. ✅ Prints restore commands for each file

### Step 5: Restart OpenClaw Gateway

```bash
# Option A: Systemd user service
systemctl --user restart openclaw

# Option B: Direct restart
openclaw gateway restart
```

**[Screenshot Placeholder: Systemd restart command and status]**

### Step 6: Verify

Check that agents can still authenticate:

```bash
# Check gateway logs
journalctl --user -u openclaw -n 50

# Verify secrets are accessible
clawvault list

# Test agent functionality
# (Send a test message to your agent)
```

**[Screenshot Placeholder: Verification commands and output]**

### Step 7: Success → Cleanup

If everything works, delete backups:

```bash
rm /home/openclaw/.openclaw/agents/*/agent/auth-profiles.json.bak.*
```

**⚠️ SECURITY REMINDER: Rotate your credentials!**

Even though secrets were encrypted during migration, rotating ensures any potential context window exposure is mitigated.

### Step 8: Fail → Restore

If the gateway fails to start or agents can't authenticate:

```bash
# Restore from backup (use the exact path printed during migration)
clawvault openclaw restore \
  "/home/openclaw/.openclaw/agents/main/agent/auth-profiles.json.bak.1739140800000" \
  --yes

# Restart gateway
systemctl --user restart openclaw
```

**[Screenshot Placeholder: Restore command execution]**

---

## Command Reference

### Migrate

```bash
# Dry-run (safe, no changes)
clawvault openclaw migrate --verbose

# Apply (backs up first)
clawvault openclaw migrate --apply --verbose

# Migrate single agent only
clawvault openclaw migrate --apply --agent-id main

# Custom ENV prefix (default: OPENCLAW)
clawvault openclaw migrate --apply --prefix MYPROJECT

# API keys only (skip OAuth tokens)
clawvault openclaw migrate --apply --api-keys-only

# No backups (not recommended)
clawvault openclaw migrate --apply --no-backup

# Custom mapping: profile → ENV var
clawvault openclaw migrate --apply \
  --map "openai:default=OPENAI_API_KEY" \
  --map "anthropic:default=ANTHROPIC_API_KEY"

# JSON output (for scripting)
clawvault openclaw migrate --apply --json
```

### Restore

```bash
# Show what would be restored
clawvault openclaw restore /path/to/backup.bak.12345

# Actually restore
clawvault openclaw restore /path/to/backup.bak.12345 --yes
```

---

## What Gets Migrated

> Note: This section describes what ClawVault can *detect and store*. It does **not** guarantee that OpenClaw will successfully *consume* `${ENV_VAR}` placeholders from `auth-profiles.json` today.

### Supported Types

| Type | Fields Migrated | Example ENV Name |
|------|----------------|------------------|
| `api_key` | `key` | `OPENCLAW_OPENAI_OPENAI_DEFAULT_KEY` |
| `oauth` | `access`, `refresh` | `OPENCLAW_GOOGLE_GOOGLE_DEFAULT_ACCESS` |
| `oauth` | `accessToken`, `refreshToken` | `OPENCLAW_CUSTOM_TEST_ACCESSTOKEN` |

### Naming Convention

Default ENV var names:
```
<PREFIX>_<PROVIDER>_<PROFILE>_<FIELD>
```

Examples:
- `OPENCLAW_OPENAI_OPENAI_DEFAULT_KEY`
- `OPENCLAW_KIMI_CODING_KIMI_CODING_DEFAULT_KEY`
- `OPENCLAW_GOOGLE_GOOGLE_DEFAULT_ACCESS`

Override with `--map`:
```bash
--map "openai:default=OPENAI_API_KEY"
→ Results in: ${OPENAI_API_KEY}
```

---

## Troubleshooting

### "No auth-profiles.json files found"

**Cause:** OpenClaw not installed or agents in different location.

**Solution:** Specify custom directory:
```bash
clawvault openclaw migrate --openclaw-dir /custom/path
```

### "Failed to store credential in keyring"

**Cause:** No keyring backend available.

**Solution:** Check doctor output:
```bash
clawvault doctor
```

Install `secret-tool` (GNOME) or use `systemd-creds` fallback.

### "Invalid auth store JSON"

**Cause:** Corrupted auth-profiles.json file.

**Solution:** Check the file manually:
```bash
cat ~/.openclaw/agents/main/agent/auth-profiles.json | jq
```

### Gateway won't start after migration

**Cause:** `auth-profiles.json` now contains `${ENV_VAR}` placeholders, but OpenClaw does not expand them (it treats them as literal strings).

**Immediate fix:**
```bash
# Restore backups
clawvault openclaw restore /path/to/backup.bak.XXX --yes
systemctl --user restart openclaw
```

**Then debug:** Check that secrets are accessible:
```bash
clawvault list
```

---

## Security Considerations

1. **Backups are created automatically** — don't delete them until you've verified everything works
2. **Old backups may contain plaintext** — delete them after successful verification
3. **Rotate credentials after migration** — mitigates any potential context window exposure
4. **ENV var names are deterministic** — anyone with file access knows what vars to look for

---

## See Also

- [Secret Requests](SECRET-REQUESTS.md) — One-time secure links for new secrets
- [CLI Reference](CLI.md) — All commands and options
- [Security Model](SECURITY.md) — Detailed threat model
