# ClawVault

ClawVault is an OS-keychain secrets backend for OpenClaw's native secrets management.

It stores secrets in the platform credential store and implements the OpenClaw exec-provider resolve protocol, so OpenClaw can fetch secret values without keeping them in plaintext config files or chat history.

## Quick Start

Add the secret you want OpenClaw to resolve:

```bash
clawvault add providers/openai/apiKey
```

Configure OpenClaw to use ClawVault as its exec provider. Example `openclaw.json` snippet:

```json
{
  "secrets": {
    "provider": {
      "type": "exec",
      "command": [
        "clawvault",
        "resolve"
      ]
    }
  }
}
```

Then run the full operator flow:

```bash
clawvault add providers/openai/apiKey
openclaw secrets configure
openclaw secrets apply
openclaw secrets reload
```

## Migrating Existing Secrets

If you already have API keys configured in `openclaw.json`, you can continue using them. ClawVault v0.2.0 provides a secure keychain option that integrates with OpenClaw's native secrets, but migration is at your own pace.

### Ready to Migrate?

When you're ready to move your API keys to a secure keychain backend, your agent can walk you through the process step by step:

1. **Check current status**:
   ```shell
   openclaw secrets audit --check
   ```

2. **Start the configuration wizard**:
   ```shell
   openclaw secrets configure
   ```

   The wizard will:
   - Scan your `openclaw.json` for plaintext API keys
   - Ask which secrets you want to migrate to ClawVault
   - Configure ClawVault as your `exec` secrets provider
   - Generate a migration plan

3. **Review and apply**:
   - The wizard shows exactly what will change
   - You can confirm, modify, or cancel at any time
   - When ready, the wizard applies your changes atomically

4. **Reload and verify**:
   ```shell
   openclaw secrets reload
   ```

Your secrets are now stored in the OS keychain (macOS Keychain, GNOME Keyring, systemd-creds, or encrypted file) and referenced by OpenClaw via ClawVault.

### Not Ready to Migrate?

No problem. Your current configuration continues working exactly as it does today. ClawVault is here when you need it — there's no deadline and no forced migration.

### Why Agent-Assisted?

Setting up ClawVault manually is straightforward, but migrating multiple secrets and updating config can be tricky with typos or missing values. An agent can guide you through each step, explain what's changing, and catch issues before they're written to your configuration.

### What About Other Projects?

ClawVault v0.2.0 is primarily for external application secrets — API keys for tools like `gh`, `codex`, `gemini-cli`, etc. If you have secrets for these tools, ClawVault's `add` and web-based entry (`clawvault request <name>`) make it easy to add them securely without ever typing them into chat or config files.

### Need Help?

Just ask your agent to "help me migrate to ClawVault" and it'll start the wizard with you.

## Secret Submission via Secure Link

The one-time request flow is still available when an operator needs a user to submit a credential directly into secure storage.

```bash
# Start ephemeral server and generate link
clawvault request providers/openai/apiKey --port 3000

# Share the printed URL with the user
# They submit the secret in their browser
# Server exits after the submission is stored
```

Security properties:
- Single-use links
- Configurable TTL
- Rate limited submissions
- Works over localhost or Tailscale
- TLS support for internet-facing deployments

See full details: [docs/SECRET-REQUESTS.md](docs/SECRET-REQUESTS.md)

## OpenClaw Migrate

Deprecated: `clawvault openclaw migrate` remains available as a scanner and migration helper for older plaintext OpenClaw setups, but ClawVault's primary role is now the exec-provider backend.

Scan OpenClaw's `auth-profiles.json` and `openclaw.json` and migrate plaintext credentials to encrypted storage. OAuth credential migration remains incomplete.

### Important Limitation

OpenClaw's `auth-profiles.json` does not support environment variable substitution. `${ENV_VAR}` placeholders are treated as literal strings.

- `clawvault openclaw migrate --apply` can rewrite files into a form OpenClaw cannot authenticate with today.
- OAuth placeholder migration is especially brittle and should be treated as unsupported.

Recommendation: use `clawvault openclaw migrate` as a dry-run scanner unless you have a custom runtime that expands placeholders.

```bash
# Step 1: Simulate
clawvault openclaw migrate --verbose

# Step 2: Apply only if your runtime supports placeholders
clawvault openclaw migrate --apply --verbose

# Step 3: Restore if needed
clawvault openclaw restore "/path/to/auth-profiles.json.bak.XXX" --yes
```

See full details: [docs/MIGRATION.md](docs/MIGRATION.md)

## Installation

```bash
npm install -g clawvault
# or
npx clawvault <command>
```

## Requirements

- Linux: `secret-tool` (GNOME Keyring) or `systemd-creds`
- macOS: Keychain
- Windows: Credential Manager
- Fallback: encrypted file storage with `CLAWVAULT_ALLOW_FALLBACK=1`

## Documentation

- [Secret Requests](docs/SECRET-REQUESTS.md)
- [Migration Guide](docs/MIGRATION.md)
- [Security Model](docs/SECURITY.md)
- [CLI Reference](docs/CLI.md)
- [Roadmap](ROADMAP.md)

## License

MIT
