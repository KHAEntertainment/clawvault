# ClawVault

Secure secret management for OpenClaw that stores secrets in OS-native encrypted keyrings and injects them into the Gateway environment.

## Security Guarantee

**ClawVault ensures secrets NEVER enter the AI context.** Secret values are:
- Stored only in encrypted platform keyrings (GNOME Keyring, macOS Keychain, Windows Credential Manager)
- Injected directly into the Gateway process environment via systemd
- Never logged, never included in error messages, never exposed to AI models

## Installation

```bash
npm install -g clawvault
```

Or build from source:

```bash
git clone https://github.com/openclaw/clawvault.git
cd clawvault
npm install
npm run build
npm link
```

## Quick Start

```bash
# Add a secret (prompts for value securely)
clawvault add OPENAI_API_KEY

# List all secrets (metadata only, never values)
clawvault list

# Remove a secret
clawvault remove OPENAI_API_KEY

# Update a secret value
clawvault rotate OPENAI_API_KEY

# Start web UI for secret submission
clawvault serve --port 3000
```

## How It Works

### OpenClaw Integration

ClawVault aligns with OpenClaw's environment variable substitution pattern:

```
Config file:        apiKey: "${OPENAI_API_KEY}"  (placeholder)
ClawVault injects:  OPENAI_API_KEY=sk-...      (actual value → systemd)
Gateway resolves:   Config substitutes ${VAR} from environment
```

### Storage Backends

| Platform | Backend | Tool | Install |
|----------|---------|------|---------|
| Linux | GNOME Keyring | `secret-tool` | `apt install libsecret-tools` |
| macOS | Keychain | `security` | Built-in |
| Windows | Credential Manager | `cmdkey` | Built-in |
| Fallback | AES-256-GCM encrypted file | — | Automatic (development only) |

### Gateway Injection

```bash
# ClawVault injects secrets to systemd user environment
systemctl --user set-environment OPENAI_API_KEY=sk-...

# Gateway imports and starts
systemctl --user import-environment OPENAI_API_KEY
systemctl --user start openclaw-gateway.service
```

## Architecture: Two-Layer Design

ClawVault separates **secret metadata** (what secrets exist, how they're used) from **secret values** (the actual credentials). These live in two different places:

```
┌─────────────────────────────────────────┐
│  Configuration (metadata only)          │
│  ~/.config/clawvault/secrets.json       │
│  Names, descriptions, validation rules  │
└──────────────────┬──────────────────────┘
                   │ references
┌──────────────────▼──────────────────────┐
│  Secret Values (never in plaintext)     │
│  OS Keyring or Fallback encrypted file  │
│  Actual API keys, tokens, passwords     │
└─────────────────────────────────────────┘
```

### Secret Value Storage (Primary): OS Keyring

On supported platforms, secret values are stored in the OS-native encrypted keyring. This is the recommended and default path.

**Linux** — GNOME Keyring via `libsecret` (`secret-tool`):

```bash
# Install libsecret-tools (Debian/Ubuntu)
sudo apt install libsecret-tools

# ClawVault uses secret-tool under the hood:
#   Store:  secret-tool store --label="ClawVault: NAME" service clawvault key NAME
#   Lookup: secret-tool lookup service clawvault key NAME
#   Delete: secret-tool remove service clawvault key NAME
```

**macOS** — Keychain via `security` (built-in, no installation needed).

**Windows** — Credential Manager via `cmdkey` (built-in, no installation needed).

### Secret Value Storage (Fallback): Encrypted File

When no keyring tools are detected, ClawVault falls back to AES-256-GCM encrypted file storage at `~/.clawvault/secrets.enc.json`. This is intended for development environments only.

- Encryption key is derived via `scrypt` from the machine ID (`/etc/machine-id` on Linux) combined with a random 32-byte salt stored at `~/.clawvault/.salt`
- Both files are created with mode `0600` (owner read/write only)
- GCM authentication tag detects tampering
- A prominent warning is printed when the fallback is active

> **Note:** The fallback is weaker than a real keyring because the key is derivable from filesystem artifacts. Any process running as the same user can read the encrypted file. Install your platform's keyring tools for production use.

### Configuration (Metadata Only)

Secret *definitions* are stored in `~/.config/clawvault/secrets.json`. This file contains only metadata -- names, descriptions, validation rules, and gateway mappings. It never contains secret values.

```json
{
  "version": 1,
  "secrets": {
    "OPENAI_API_KEY": {
      "description": "OpenAI API key for GPT models",
      "environmentVar": "OPENAI_API_KEY",
      "provider": "openai",
      "required": false,
      "gateways": ["main"],
      "validation": {
        "pattern": "^sk-[a-zA-Z0-9]{48}$",
        "minLength": 51,
        "maxLength": 51
      }
    }
  },
  "gateway": {
    "restartOnUpdate": true,
    "services": ["openclaw-gateway.service"]
  }
}
```

| Field | Purpose |
|-------|---------|
| `description` | Human-readable label (shown in `clawvault list`) |
| `environmentVar` | Env var name injected into the Gateway process |
| `provider` | Service this key belongs to (openai, anthropic, etc.) |
| `required` | Whether the Gateway should fail if this secret is missing |
| `gateways` | Which gateway instances receive this secret |
| `validation` | Optional regex pattern and length constraints for the value |

## CLI Commands

| Command | Description |
|---------|-------------|
| `add <name>` | Add a new secret (prompts securely) |
| `list` | List secrets (metadata only) |
| `remove <name>` | Remove a secret |
| `rotate <name>` | Update a secret value |
| `serve` | Start web UI server |

### Options

```
--version     Show version number
-h, --help    Show help
```

## Web UI

Start the web server for secure secret submission:

```bash
clawvault serve --port 3000
```

The web UI:
- Binds to `localhost` by default
- Accepts secret submissions via POST to `/api/submit`
- Returns only metadata (never secret values)

## Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Watch mode
npm run dev

# Run tests
npm test

# Lint
npm run lint
```

## Testing

```bash
# Run all tests
npm test

# Run specific test file
npx jest test/unit/storage/linux.test.ts

# Coverage report
npm test -- --coverage
```

## Security Design

### Zero AI Exposure

1. **CLI**: Uses `inquirer` with masked input - secrets never hit logs
2. **Storage**: Platform keyrings - secrets encrypted at rest
3. **Injection**: Direct to systemd/environment - no intermediate files
4. **API**: Web routes return metadata only - values never in responses

### Audit Trail

All operations are logged with metadata only:
- Secret name
- Operation type (add/remove/rotate)
- Timestamp
- No secret values in logs

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see LICENSE file for details.

## Related Projects

ClawVault was inspired by and builds on ideas from:

- **Confidant** by Eric Santos: https://clawhub.ai/ericsantos/confidant
- **Credential Manager skill** in OpenClaw Skills: https://github.com/openclaw/skills/blob/main/skills/callmedas69/credential-manager/SKILL.md
- **OpenClaw**: AI Gateway that uses ClawVault for secret management

## Author

Billy Brenner
https://khaent.com

Coded with care by Jean Clawd (openclaw Agent), Claude Code and Codex.
