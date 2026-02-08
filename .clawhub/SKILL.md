# ClawVault Skill

## Metadata

```yaml
name: clawvault
version: 1.0.0
description: Secure secret management for OpenClaw
author: Billy <billy@openclaw.dev>
license: MIT
homepage: https://github.com/openclaw/clawvault
```

## Description

ClawVault is a secure secret management system for OpenClaw that stores API keys and other sensitive credentials in OS-native encrypted keyrings and injects them into the OpenClaw Gateway environment.

### Key Security Guarantee

**Secret values NEVER enter AI context.** All secret operations are handled directly through the keyring, with only metadata exposed to AI systems.

## Features

- **Encrypted Storage**: Platform-native keyrings (GNOME Keyring, macOS Keychain, Windows Credential Manager)
- **AI Context Isolation**: Secrets bypass AI model context entirely
- **Dynamic Configuration**: JSON-based secret definitions with validation
- **Gateway Integration**: Automatic injection into OpenClaw Gateway environment
- **Web UI**: HTTP interface for secure secret submission
- **CLI Tool**: Command-line interface with hidden input prompts

## Commands

### CLI Commands

```bash
# Add a new secret
clawvault add <name> [-p <provider>] [-e <env_var>]

# List all secrets (metadata only)
clawvault list

# Remove a secret
clawvault remove <name> [-f]

# Rotate a secret value
clawvault rotate <name>

# Start web UI server
clawvault serve [-p <port>] [-H <host>] [--tls]
```

### Example Usage

```bash
# Add OpenAI API key
clawvault add OPENAI_API_KEY -p openai

# Add custom secret
clawvault add MY_API_KEY -p myservice -e CUSTOM_API_KEY

# List stored secrets
clawvault list

# Start web UI on localhost:3000
clawvault serve
```

## Configuration

### Config Location

`~/.config/clawvault/secrets.json`

### Config Schema

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

## API Usage

### Library API

```typescript
import { createStorage } from 'clawvault/storage'
import { loadConfig } from 'clawvault/config'
import { injectToGateway } from 'clawvault/gateway'

// Create storage provider
const storage = await createStorage()

// Store a secret
await storage.set('MY_SECRET', 'secret-value')

// Load configuration
const config = await loadConfig()

// Inject secrets to gateway
await injectToGateway(storage, config)
```

### Web API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/` | GET | Secret submission form |
| `/api/submit` | POST | Store a secret |
| `/api/status` | GET | List secrets (metadata) |
| `/health` | GET | Health check |

## Platform Support

| Platform | Storage Backend | Tools Required |
|----------|-----------------|----------------|
| Linux | GNOME Keyring | `libsecret-tools` |
| macOS | Keychain Services | Built-in |
| Windows | Credential Manager | Built-in |
| Any | Encrypted File (fallback) | None |

## Security Model

### What We Protect

- Secrets encrypted at rest in platform keyrings
- AI context isolation (secrets never in AI logs)
- Config file contains only definitions, not values
- Shell history protection via hidden input
- Audit logging with metadata only

### What We Don't Protect

- Gateway process memory (secrets in environment)
- Network transmission without TLS (use `--tls`)
- Fallback storage (weaker than keyring)

## Integration with OpenClaw Gateway

Secrets are automatically injected into the OpenClaw Gateway environment:

1. User adds secret via CLI or Web UI
2. Secret stored in encrypted keyring
3. Gateway restart injects secrets as environment variables
4. Gateway process accesses secrets via `process.env`

### Systemd Integration

```bash
# Secrets imported to systemd user session
systemctl --user import-environment OPENAI_API_KEY

# Gateway service restarted
systemctl --user restart openclaw-gateway.service
```

## Installation

```bash
npm install -g clawvault
```

## Development

```bash
# Clone repository
git clone https://github.com/openclaw/clawvault.git
cd clawvault

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Development mode
npm run dev
```

## Documentation

- `docs/SECURITY.md` - Security model and threat analysis
- `docs/ARCHITECTURE.md` - System architecture
- `docs/API.md` - API documentation
- `docs/CONFIGURATION.md` - Configuration guide
- `docs/PLATFORMS.md` - Platform-specific notes
- `docs/CONTRIBUTING.md` - Contributing guidelines

## Contributing

Contributions welcome! Please see `docs/CONTRIBUTING.md` for guidelines.

## License

MIT License - see LICENSE file for details

## Support

- GitHub Issues: https://github.com/openclaw/clawvault/issues
- Documentation: https://github.com/openclaw/clawvault/tree/main/docs
