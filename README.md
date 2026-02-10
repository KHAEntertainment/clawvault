# ClawVault

Secure secret management for OpenClaw. Store API keys and credentials in your OS-native encrypted keyring — never in plaintext, never in AI context.

## Quick Start

```bash
# Add a secret interactively
clawvault add OPENAI_API_KEY

# List stored secrets (metadata only)
clawvault list

# Create a one-time secure link for someone to submit a secret
clawvault request SECRET_NAME --host 100.x.x.x --port 3000
```

## Secret Submission via Secure Link (Confidant-Style)

The safest way to receive secrets. Creates a one-time URL where users can submit credentials directly to encrypted storage — no chat logs, no context exposure.

### Basic Usage

```bash
# Start ephemeral server and generate link
clawvault request OPENAI_API_KEY --port 3000

# Share the printed URL with the user
# They submit the secret in their browser
# Server auto-detects and exits when received
```

**Security features:**
- ✅ Single-use links (expire after submission)
- ✅ Configurable TTL (default 15 minutes)
- ✅ Rate limited to prevent abuse
- ✅ Works over Tailscale (recommended) or localhost
- ✅ TLS support for internet-facing deployments

**See full details:** [docs/SECRET-REQUESTS.md](docs/SECRET-REQUESTS.md)

## Migrate Existing Secrets

Scan OpenClaw's auth-profiles.json and migrate plaintext credentials to encrypted storage.

### ⚠️ Important Limitation

**OpenClaw's `auth-profiles.json` does not support environment variable substitution.** OAuth tokens will break if migrated to `${ENV_VAR}` format because OpenClaw parses them as JWTs.

**Current status:** Plaintext credentials with filesystem permissions (0600) for single-user deployments. See [ROADMAP.md](ROADMAP.md) for upstream issue tracking and planned eCryptfs alternative.

### Safe Migration Workflow

```bash
# Step 1: Simulate (see what will migrate)
clawvault openclaw migrate --verbose

# Step 2: Apply (backs up originals first)
clawvault openclaw migrate --apply --verbose

# Step 3: If anything breaks, restore
clawvault openclaw restore "/path/to/auth-profiles.json.bak.XXX" --yes
```

**See full details:** [docs/MIGRATION.md](docs/MIGRATION.md)

## Installation

```bash
npm install -g clawvault
# or
npx clawvault <command>
```

## Requirements

- **Linux:** `secret-tool` (GNOME Keyring) or `systemd-creds` (headless)
- **macOS:** Keychain (built-in)
- **Windows:** Credential Manager (built-in)
- **Fallback:** Encrypted file storage (requires `CLAWVAULT_ALLOW_FALLBACK=1`)

## Security Guarantees

1. **Secrets never enter AI context** — direct to OS keyring
2. **Encrypted at rest** — using platform-native mechanisms
3. **No plaintext in logs** — only metadata
4. **Backup before migration** — automatic failsafe

## Documentation

- [Secret Requests](docs/SECRET-REQUESTS.md) — One-time secure links
- [Migration Guide](docs/MIGRATION.md) — Migrate from OpenClaw plaintext
- [Security Model](docs/SECURITY.md) — Threat model and guarantees
- [CLI Reference](docs/CLI.md) — All commands and options
- [Roadmap](ROADMAP.md) — Future plans and known limitations

## License

MIT
