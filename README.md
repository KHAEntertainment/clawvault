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
