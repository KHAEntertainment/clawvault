# CLI Reference

Complete reference for all `clawvault` commands.

## Global Options

All commands support:
- `--help` — Show help
- `--version` — Show version

---

## Core Commands

### `add <name>`

Add a secret interactively.

```bash
clawvault add OPENAI_API_KEY
# Prompts for value (hidden input)
```

### `list`

List stored secrets (metadata only, never values).

```bash
clawvault list
```

Output:
```
Stored Secrets:

  OPENAI_API_KEY
    Description: OpenAI API key for GPT models
    Provider: openai

Total: 1 secret
```

### `remove <name>`

Remove a secret from storage.

```bash
clawvault remove OPENAI_API_KEY
# Prompts for confirmation
```

### `rotate <name>`

Update an existing secret's value.

```bash
clawvault rotate OPENAI_API_KEY
# Prompts for new value
```

---

## Web Server Commands

### `serve`

Start persistent web UI for secret submission.

```bash
# Local only (safest)
clawvault serve

# Over Tailscale
clawvault serve --host 100.x.x.x --port 3000

# With TLS
clawvault serve --host secrets.example.com --port 443 \
  --tls --cert cert.pem --key key.pem

# Allow non-localhost HTTP (not recommended)
clawvault serve --host 192.168.1.100 --allow-insecure-http
```

**Options:**
- `-p, --port <port>` — Port (default: 3000)
- `-H, --host <host>` — Host (default: localhost)
- `--tls` — Enable HTTPS
- `--cert <path>` — TLS certificate
- `--key <path>` — TLS private key
- `--allow-insecure-http` — Skip security warnings

### `request <name>`

Create one-time secure link for secret submission.

```bash
# Basic usage
clawvault request OPENAI_API_KEY

# Full options
clawvault request OPENAI_API_KEY \
  --host 100.113.254.117 \
  --port 3000 \
  --label "OpenAI API Key for Whisper" \
  --timeout-min 15
```

**Options:**
- `-p, --port <port>` — Port (default: 3000)
- `-H, --host <host>` — Host (default: localhost)
- `--tls` — Enable HTTPS
- `--cert <path>` — TLS certificate
- `--key <path>` — TLS private key
- `--allow-insecure-http` — Allow dangerous HTTP binding
- `--label <text>` — Description shown on form
- `--timeout-min <n>` — Expiry in minutes (default: 15)

---

## OpenClaw Integration Commands

### `openclaw migrate`

Migrate plaintext secrets from auth-profiles.json to encrypted storage (**experimental**).

⚠️ **Important:** OpenClaw does not currently expand `${ENV_VAR}` placeholders in `auth-profiles.json`. Using `--apply` will rewrite the file into a format OpenClaw cannot use. Prefer dry-run mode until upstream support exists.

```bash
# Dry-run (safe, shows what will migrate)
clawvault openclaw migrate --verbose

# Apply migration
clawvault openclaw migrate --apply --verbose

# Single agent only
clawvault openclaw migrate --apply --agent-id main

# Custom ENV prefix
clawvault openclaw migrate --apply --prefix MYAPP

# API keys only
clawvault openclaw migrate --apply --api-keys-only

# Custom mapping
clawvault openclaw migrate --apply \
  --map "openai:default=OPENAI_API_KEY"

# JSON output
clawvault openclaw migrate --apply --json
```

**Options:**
- `--apply` — Actually make changes (default is dry-run)
- `--openclaw-dir <path>` — Custom OpenClaw directory
- `--agent-id <id>` — Migrate single agent only
- `--prefix <prefix>` — ENV var prefix (default: OPENCLAW)
- `--api-keys-only` — Skip OAuth credentials
- `--no-backup` — Don't create .bak files (dangerous)
- `--map <profile=ENV>` — Custom ENV var mapping
- `--json` — Output JSON report
- `--verbose` — Show per-secret details

### `openclaw restore <backup-path>`

Restore auth-profiles.json from backup (failsafe).

```bash
# Preview restore
clawvault openclaw restore \
  "/path/to/auth-profiles.json.bak.12345"

# Actually restore
clawvault openclaw restore \
  "/path/to/auth-profiles.json.bak.12345" \
  --yes
```

**Options:**
- `--yes` — Skip confirmation prompt

---

## Utility Commands

### `doctor`

Check installation and dependencies.

```bash
clawvault doctor
```

Checks:
- libsecret/secret-tool availability
- D-Bus session bus
- systemd integration
- File permissions

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `CLAWVAULT_ALLOW_FALLBACK=1` | Allow encrypted-file fallback when no keyring |
| `XDG_DATA_HOME` | Data directory (default: ~/.local/share) |

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error / user cancelled |

---

## See Also

- [Secret Requests](SECRET-REQUESTS.md)
- [Migration Guide](MIGRATION.md)
- [Security Model](SECURITY.md)
