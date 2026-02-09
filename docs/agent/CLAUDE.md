# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ClawVault is a secure secret management system for OpenClaw that stores secrets in OS-native encrypted keyrings (GNOME Keyring, macOS Keychain, Windows Credential Manager) and injects them into the OpenClaw Gateway environment. The core security guarantee is that secrets NEVER enter the AI context.

**Critical:** This project is in early development - the directory structure exists but implementation is in progress.

## Development Commands

```bash
# Build TypeScript
npm run build

# Watch mode for development
npm run dev

# Run tests
npm test

# Lint code
npm run lint

# Run CLI locally
npm start
# or
node dist/cli.js

# Run single test file
npx jest path/to/test.test.ts
```

## Architecture

```
src/
├── cli/           # Command-line interface (commander.js + inquirer)
│   └── commands/  # Individual command implementations
├── config/        # Dynamic secret definitions, validation schemas
├── gateway/       # OpenClaw Gateway integration (environment injection)
├── storage/       # Platform-specific keyring providers
│   └── providers/ # linux.ts, macos.ts, windows.ts, fallback.ts
├── types/         # TypeScript type definitions
└── web/           # Express server for secret submission UI
    └── routes/
        └── templates/  # HTML forms
```

### Key Design Principles

1. **Zero AI Exposure** - Secrets must never pass through AI model context. The `get()` method returns only metadata, never secret values. Secret values are only retrieved internally for direct gateway injection.

2. **Platform Abstraction** - Storage interface (`src/storage/interfaces.ts`) abstracts platform differences. Each platform provider implements: `set(name, value)`, `get(name)`, `delete(name)`, `list()`.

3. **Dynamic Configuration** - Secret definitions are loaded from `~/.config/clawvault/secrets.json`, not hardcoded. Users can add any secret type via CLI.

4. **Gateway Integration** - Secrets are injected as environment variables into the OpenClaw Gateway via systemd/launchd hooks, not stored in config files.

### Storage Provider Detection

Storage providers are auto-detected based on platform and binary availability:
- **Linux:** `process.platform === 'linux'` and `secret-tool` command exists
- **macOS:** `process.platform === 'darwin'` and `security` command exists
- **Windows:** `process.platform === 'win32'` and `cmdkey` command exists
- **Fallback:** Encrypted file storage (development only, emits warning)

## Keyring Storage Schema

Each platform uses a consistent schema pattern:

**Linux (GNOME Keyring via secret-tool):**
```
service: "clawvault"
key: "<SECRET_NAME>"
label: "ClawVault: <SECRET_DESCRIPTION>"
```

**macOS (Keychain via security):**
```
account: "clawvault"
service: "<SECRET_NAME>"
label: "ClawVault: <SECRET_DESCRIPTION>"
```

**Windows (Credential Manager via cmdkey):**
```
/target:clawvault /user:<SECRET_NAME>
```

## Configuration Format

`~/.config/clawvault/secrets.json`:
```json
{
  "version": 1,
  "secrets": {
    "OPENAI_API_KEY": {
      "description": "OpenAI API key for GPT models",
      "environmentVar": "OPENAI_API_KEY",
      "provider": "openai",
      "required": false,
      "gateways": ["main"]
    }
  },
  "gateway": {
    "restartOnUpdate": true,
    "services": ["openclaw-gateway.service"]
  }
}
```

## Security Considerations

**When implementing security-critical features:**

1. Never log secret values - use audit logging for metadata only (what secret, when, by whom)
2. Never return secret values from API methods that could be exposed to AI
3. Validate inputs before keyring operations
4. Use HTTPS/TLS for web UI when enabled
5. Bind web UI to localhost by default (require explicit flag for network exposure)
6. Secrets in gateway process environment can be exposed via process inspection - document this limitation

**Critical test:** `test/security/context-leak.ts` verifies secrets never appear in error messages, logs, or AI-accessible outputs.

## Related Projects

This project combines ideas from:
- **Confidant** (`../reference/reference-confidant.md`) - Web UI submission pattern inspiration
- **Secret Manager** (`../reference/reference-secret-manager.md`) - Keyring + systemd integration inspiration

See `../planning/DESIGN.md` for comprehensive system design documentation.

## TypeScript Configuration

- Target: ES2022
- Module: ES2022
- Strict mode enabled
- Source maps and declarations generated for library distribution
- Output: `dist/` directory
