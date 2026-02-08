# ClawVault Architecture

## Overview

ClawVault is a cross-platform secret management system designed to store API keys and other sensitive credentials securely while never exposing them to AI model context. The architecture follows a layered design with clear separation of concerns.

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Interface Layer                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │   CLI Tool   │  │   Web UI     │  │  Library API         │  │
│  │  (commander) │  │  (express)   │  │  (programmatic)      │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
└─────────┼─────────────────┼─────────────────────┼──────────────┘
          │                 │                     │
┌─────────┼─────────────────┼─────────────────────┼──────────────┐
│         ▼                 ▼                     ▼              │
│                    Configuration Layer                         │
│  ┌────────────────────────────────────────────────────────┐   │
│  │  Config Loader (schemas, validation, defaults)         │   │
│  │  Location: ~/.config/clawvault/secrets.json            │   │
│  └────────────────────────┬───────────────────────────────┘   │
└───────────────────────────┼───────────────────────────────────┘
                            │
┌───────────────────────────┼───────────────────────────────────┐
│                           ▼                                   │
│                      Storage Layer                            │
│  ┌────────────────────────────────────────────────────────┐  │
│  │              StorageProvider Interface                 │  │
│  │  set() | get() | delete() | list() | has()            │  │
│  └────────────────────────┬───────────────────────────────┘  │
│                           │                                   │
│  ┌────────────┬───────────┼───────────┬────────────┐          │
│  ▼            ▼           ▼           ▼            ▼          │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌────────────┐          │
│ │ Linux   │ │ macOS   │ │Windows  │ │  Fallback  │          │
│ │Keyring  │ │Keychain │ │CredMgr  │ │   File     │          │
│ └─────────┘ └─────────┘ └─────────┘ └────────────┘          │
└─────────────────────────────────────────────────────────────┘
                            │
┌───────────────────────────┼───────────────────────────────────┐
│                           ▼                                   │
│                    Gateway Integration                         │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Environment Injection (systemd, launchd)              │  │
│  │  Service Restart Management                           │  │
│  └────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
```

## Component Overview

### Storage Layer (`src/storage/`)

The storage layer provides a unified interface (`StorageProvider`) for platform-specific keyring implementations.

**Interface Definition** (`src/storage/interfaces.ts`):
```typescript
interface StorageProvider {
  set(name: string, value: string): Promise<void>
  get(name: string): Promise<string | null>       // INTERNAL USE ONLY
  delete(name: string): Promise<void>
  list(): Promise<string[]>
  has(name: string): Promise<boolean>
}
```

**Platform Providers**:

| Provider | File | Platform | Tools Required |
|----------|------|----------|----------------|
| `LinuxKeyringProvider` | `providers/linux.ts` | Linux | `secret-tool` (libsecret-tools) |
| `MacOSKeychainProvider` | `providers/macos.ts` | macOS | `security` (built-in) |
| `WindowsCredentialManager` | `providers/windows.ts` | Windows | `cmdkey` (built-in) |
| `FallbackProvider` | `providers/fallback.ts` | Any | None (encrypted file) |

**Platform Detection** (`src/storage/platform.ts`):
- Automatically detects platform availability
- Falls back to encrypted file storage with warning
- Returns `PlatformInfo` with provider type

**Audit Logging** (`src/storage/audit.ts`):
- Logs all operations with metadata only
- Never logs secret values
- Location: `~/.clawvault/audit.log`

### Configuration System (`src/config/`)

The configuration system manages secret definitions and gateway settings.

**Config Schema** (`src/config/schemas.ts`):
```typescript
interface ConfigSchema {
  version: number
  secrets: Record<string, SecretDefinitionSchema>
  gateway: GatewayConfigSchema
}
```

**Secret Definition**:
```typescript
interface SecretDefinitionSchema {
  description: string          // Human-readable description
  environmentVar: string        // Target environment variable
  provider: string              // Service provider (openai, anthropic, etc.)
  required: boolean             // Whether secret is required
  gateways: string[]            // Target gateway names
  rotation?: RotationSchema     // Optional rotation settings
  validation?: ValidationSchema // Optional validation rules
}
```

**Default Templates** (`src/config/defaults.ts`):
- Pre-defined templates for common services
- OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, DISCORD_BOT_TOKEN

**Config Loader** (`src/config/index.ts`):
- Path: `~/.config/clawvault/secrets.json`
- Auto-creates default config on first run
- Validates before loading/saving

### Gateway Integration (`src/gateway/`)

The gateway integration layer injects secrets into the OpenClaw Gateway environment.

**Environment Injection** (`src/gateway/environment.ts`):
```typescript
interface EnvironmentInjection {
  [key: string]: string  // envVarName: value
}

async function injectSecrets(
  storage: StorageProvider,
  secretNames: string[]
): Promise<EnvironmentInjection>
```

**Systemd Manager** (`src/gateway/systemd.ts`):
- Imports environment variables to systemd user session
- Restarts configured gateway services
- Checks service status

**Main Injection Flow**:
1. Load configuration
2. Retrieve secret values from keyring (internal)
3. Map secrets to environment variable names
4. Import to systemd/launchd
5. Optionally restart gateway services

### Web UI (`src/web/`)

The Web UI provides an HTTP interface for secret submission.

**Express Server** (`src/web/index.ts`):
- Binds to localhost by default
- Optional HTTPS with `--tls` flag
- Security headers: `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`

**Routes**:

| Route | Method | Handler | Purpose |
|-------|--------|---------|---------|
| `/` | GET | serve form.html | Submission form |
| `/api/submit` | POST | submitSecret | Store secret in keyring |
| `/api/status` | GET | statusRoute | List stored secrets (metadata) |
| `/health` | GET | health check | Server health status |

**Response Format** (never includes secret values):
```json
{
  "success": true,
  "message": "Secret \"OPENAI_API_KEY\" stored successfully",
  "metadata": {
    "name": "OPENAI_API_KEY",
    "length": 51,
    "description": "OpenAI API key"
  }
}
```

### CLI Tool (`src/cli/`)

The CLI tool provides command-line interface for secret management.

**Commands**:

| Command | Description | Interactive |
|---------|-------------|-------------|
| `add <name>` | Add a new secret | Yes (hidden input) |
| `list` | List secrets (metadata only) | No |
| `remove <name>` | Remove a secret | Yes (confirmation) |
| `rotate <name>` | Rotate secret value | Yes (hidden input) |
| `serve [options]` | Start web UI server | No |

**Options**:
- `-p, --provider <provider>`: Service provider
- `-e, --env <var>`: Environment variable name
- `-f, --force`: Skip confirmation
- `-H, --host <host>`: Bind host (default: localhost)
- `-p, --port <port>`: Port number (default: 3000)
- `--tls`: Enable HTTPS

## Data Flow

### Adding a Secret (CLI)

```
User input → inquirer (hidden) → storage.set() → Platform Keyring
                                      ↓
                              audit.log (metadata)
```

### Adding a Secret (Web)

```
Form POST → /api/submit → validation → storage.set() → Platform Keyring
                                            ↓
                                    Response: { success, metadata }
```

### Gateway Injection

```
injectToGateway() → loadConfig() → storage.get() (internal)
                                     ↓
                              map secrets to env vars
                                     ↓
                              systemd import-environment
                                     ↓
                              restart gateway services
```

## Security Architecture

### AI Context Isolation

The critical security property is that secret values never flow through AI-accessible paths:

```
┌─────────────┐     ┌─────────────┐
│   User      │────▶│     CLI     │─────┐ (hidden input)
└─────────────┘     └─────────────┘     │
                                           ▼
                                    ┌──────────┐
                                    │ Keyring  │
                                    └─────┬────┘
                                          │
                         ┌────────────────┴────────────────┐
                         │                                 │
                         ▼                                 ▼
                  ┌─────────────┐                 ┌─────────────┐
                  │    Gateway  │                 │   Audit     │
                  │  (internal) │                 │  (metadata) │
                  └─────────────┘                 └─────────────┘
```

**AI never sees**: secret values from `get()`

**AI sees**: secret names, counts, descriptions, operation results

### Audit Trail

All operations are logged to `~/.clawvault/audit.log`:

```json
{"timestamp":"2024-01-15T10:30:00Z","action":"set","secretName":"OPENAI_API_KEY","success":true}
{"timestamp":"2024-01-15T10:30:05Z","action":"list","secretName":"N/A","success":true}
```

## Extension Points

### Adding a New Platform Provider

1. Implement `StorageProvider` interface
2. Add platform detection in `platform.ts`
3. Register in `storage/index.ts` factory

Example:
```typescript
export class NewPlatformProvider implements StorageProvider {
  async set(name: string, value: string): Promise<void> { /* ... */ }
  async get(name: string): Promise<string | null> { /* ... */ }
  async delete(name: string): Promise<void> { /* ... */ }
  async list(): Promise<string[]> { /* ... */ }
  async has(name: string): Promise<boolean> { /* ... */ }
}
```

### Adding a New Secret Template

Edit `src/config/defaults.ts`:
```typescript
const defaultConfig: ConfigSchema = {
  secrets: {
    MY_NEW_API_KEY: {
      description: 'My New Service API key',
      environmentVar: 'MY_NEW_API_KEY',
      provider: 'myservice',
      required: false,
      gateways: ['main'],
      validation: {
        pattern: '^mykey_[a-zA-Z0-9]{32}$',
        minLength: 37
      }
    }
  }
}
```

## File Locations

| File | Location | Purpose |
|------|----------|---------|
| Config | `~/.config/clawvault/secrets.json` | Secret definitions |
| Keyring | Platform-specific | Encrypted secret values |
| Audit log | `~/.clawvault/audit.log` | Operation metadata |
| Fallback storage | `~/.clawvault/secrets.enc.json` | Encrypted file backup |
| Salt | `~/.clawvault/.salt` | Fallback encryption salt |

## Dependencies

### Runtime
- `express`: Web UI server
- `commander`: CLI framework
- `chalk`: Terminal colors
- `inquirer`: Interactive prompts

### Platform Tools (Optional)
- Linux: `libsecret-tools` (secret-tool)
- macOS: Built-in (security command)
- Windows: Built-in (cmdkey)

## TypeScript Configuration

- Target: ES2022
- Module: ES2022
- Strict mode enabled
- Source maps enabled
- Output: `dist/` directory
