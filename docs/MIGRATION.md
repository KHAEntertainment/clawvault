# Migration Guide

Migrate existing OpenClaw credentials from plaintext `auth-profiles.json` files to encrypted ClawVault storage using the OpenClaw exec provider protocol.

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

## Recommended Migration Path: SecretsApplyPlan

The recommended approach uses OpenClaw's native `exec` provider protocol via `openclaw secrets apply`. This method:

1. Scans all `auth-profiles.json` files for plaintext secrets
2. Generates a `SecretsApplyPlan` that tells OpenClaw how to resolve secrets via ClawVault
3. Uses the exec provider protocol - secrets NEVER leave the keyring
4. OpenClaw fetches secret values at runtime via `clawvault resolve`

### Why not `${ENV_VAR}` placeholders?

OpenClaw does **not** expand `${ENV_VAR}` strings in `auth-profiles.json`. Using placeholders will cause authentication failures. The exec provider approach avoids this limitation entirely.

### What CAN be migrated via plan

| Type | Fields | Notes |
|------|--------|-------|
| `api_key` | `key` | Converted to `keyRef` with exec source |
| `token` | `token` | Converted to `tokenRef` with exec source |

### What CANNOT be migrated via plan

| Type | Reason |
|------|--------|
| `oauth` | OAuth tokens are runtime-minted and rotating - they don't support `keyRef`/`tokenRef` |

For OAuth credentials, use OpenClaw's native sync feature after migration.

---

## Migration Workflow

### Step 1: Generate Migration Plan

```bash
clawvault openclaw migrate --plan --verbose
```

This scans all auth stores and generates `clawvault-migration-plan.json`.

Example output:
```text
SecretsApplyPlan generated: clawvault-migration-plan.json
Agents scanned: 3

Secrets that CAN be migrated via exec provider: 4
  openai:default (main)
    Provider: openai, Field: key
    Exec ID: providers/openai/key

Secrets that CANNOT be migrated: 2
  - 1 OAuth credentials (not supported by exec provider)

Next steps:
  1. Review the plan: cat clawvault-migration-plan.json
  2. Dry-run: openclaw secrets apply --from ./clawvault-migration-plan.json --dry-run
  3. Apply: openclaw secrets apply --from ./clawvault-migration-plan.json
  4. For OAuth: Use openclaw models auth login --sync-siblings instead
```

### Step 2: Review the Plan

```bash
cat clawvault-migration-plan.json
```

The plan shows:
- `targets`: Which secrets will be migrated and their exec provider IDs
- `providerUpserts`: How to configure the clawvault exec provider
- `options`: Scrub settings for legacy auth files

### Step 3: Dry-Run (Recommended)

```bash
openclaw secrets apply --from ./clawvault-migration-plan.json --dry-run
```

This shows what changes will be made without actually applying them.

### Step 4: Apply the Plan

```bash
openclaw secrets apply --from ./clawvault-migration-plan.json
```

This:
1. Stores secrets in ClawVault (encrypted in keyring)
2. Updates `auth-profiles.json` files with exec `keyRef`/`tokenRef`
3. Configures the clawvault exec provider in OpenClaw

### Step 5: Handle OAuth Separately

OAuth credentials cannot use exec provider refs. Instead, use OpenClaw's native OAuth handling:

```bash
# Re-authenticate for each OAuth provider
openclaw models auth login --provider google --sync-siblings
openclaw models auth login --provider github --sync-siblings
```

The `--sync-siblings` flag automatically syncs tokens to all sibling agents.

### Step 6: Restart Gateway

```bash
openclaw gateway restart
```

### Step 7: Verify

```bash
# Test that secrets resolve correctly
echo '{"protocolVersion":1,"ids":["providers/openai/key"]}' | clawvault resolve

# Check agent status
openclaw models status
```

---

## Cleanup: Deduplicate Auth Configurations

After migration, you may have redundant auth profiles across agents. Use the cleanup command:

```bash
# Analyze auth configurations
clawvault openclaw cleanup --audit --verbose

# Generate consolidation plan
clawvault openclaw cleanup --consolidate
```

The cleanup command detects:
- **Shared profiles**: Same credentials duplicated across multiple agents
- **Agents with no unique profiles**: Could inherit from main agent
- **Global provider candidates**: Providers used by ALL agents

---

## Legacy Migration (Deprecated)

The old `--apply` method that writes `${ENV_VAR}` placeholders is **deprecated** and not recommended. It will be removed in a future version.

```bash
# DEPRECATED - do not use
clawvault openclaw migrate --apply --verbose
```

OpenClaw does not expand `${ENV_VAR}` placeholders, so this will break authentication.

---

## Restore from Backup

If something goes wrong, restore from backup:

```bash
clawvault openclaw restore /path/to/auth-profiles.json.bak.TIMESTAMP --yes
openclaw gateway restart
```

---

## Command Reference

### Migrate (Plan Mode - Recommended)

```bash
# Generate migration plan
clawvault openclaw migrate --plan

# With verbose output
clawvault openclaw migrate --plan --verbose

# For single agent
clawvault openclaw migrate --plan --agent-id main

# Custom provider name
clawvault openclaw migrate --plan --provider-name my-secrets
```

### Cleanup

```bash
# Brief summary
clawvault openclaw cleanup

# Detailed audit
clawvault openclaw cleanup --audit --verbose

# Generate consolidation plan
clawvault openclaw cleanup --consolidate
```

### Restore

```bash
clawvault openclaw restore /path/to/backup.bak.12345 --yes
```

---

## How It Works

### Secret ID Mapping

When OpenClaw needs a secret, it sends the exec provider ID to ClawVault:

```text
profileId: "openai:default", field: "key" → Exec ID: "providers/openai/key"
profileId: "anthropic:default", field: "key" → Exec ID: "providers/anthropic/key"
```

ClawVault's `resolve` command looks up the secret in the keyring by ID:

```bash
echo '{"protocolVersion":1,"ids":["providers/openai/key"]}' | clawvault resolve
# Returns: {"protocolVersion":1,"values":{"providers/openai/key":"sk-actual-key..."}}
```

### ProviderUpsert Configuration

The plan file tells OpenClaw how to invoke ClawVault:

```json
{
  "providerUpserts": {
    "clawvault": {
      "source": "exec",
      "command": ["clawvault", "resolve"],
      "jsonOnly": true
    }
  }
}
```

---

## Troubleshooting

### "No auth-profiles.json files found"

**Cause:** OpenClaw not installed or agents in different location.

**Solution:**
```bash
clawvault openclaw migrate --plan --openclaw-dir /custom/path
```

### "not found in keychain" error

**Cause:** Secret not stored in keyring.

**Solution:**
1. Check that migration applied successfully
2. Verify secret is in keyring: `clawvault list`
3. Re-run migration if needed

### Gateway won't start after migration

**Cause:** Auth profiles contain invalid refs.

**Immediate fix:**
```bash
# Restore from backup
clawvault openclaw restore /path/to/backup.bak.XXX --yes
openclaw gateway restart
```

### OAuth providers not working

**Cause:** OAuth credentials can't use exec provider refs.

**Solution:** Re-authenticate via OpenClaw:
```bash
openclaw models auth login --provider <provider> --sync-siblings
```

---

## Security Considerations

1. **Secrets never leave the keyring** - OpenClaw fetches values via exec provider at runtime
2. **Plan files contain metadata only** - No secret values in the plan JSON
3. **Backups are created** - Original files backed up before modification
4. **Audit logging** - All operations logged with metadata only (no values)

---

## See Also

- [Secret Requests](SECRET-REQUESTS.md) - One-time secure links for new secrets
- [CLI Reference](CLI.md) - All commands and options
- [Security Model](SECURITY.md) - Detailed threat model
