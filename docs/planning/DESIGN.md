# ClawVault - System Design Document

## 1. Executive Summary

ClawVault is a secure secret management system for OpenClaw that combines the UX strengths of Confidant (web-based submission) with the security model of Secret Manager (system keyring storage). Unlike both predecessors, ClawVault ensures secrets NEVER enter AI context while providing dynamic, extensible secret definitions and cross-platform support.

**Core Security Guarantee:** Secrets are stored exclusively in OS-native encrypted keyrings and injected directly into the OpenClaw Gateway environment. The AI model never receives secrets in context.

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     User Workflow                           │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ├──────────────────────────────────────────┐
                     │                                          │
                     ▼                                          ▼
         ┌──────────────────────┐                  ┌──────────────────────┐
         │    Web UI Server     │                  │      CLI Tool        │
         │  (Confidant-style)   │                  │  (interactive)      │
         │                      │                  │                      │
         │  - Submit secrets    │                  │  - Add/List/Remove   │
         │  - One-time tokens   │                  │  - Status check      │
         │  - HTTPS/TLS         │                  │  - Config reload     │
         └──────────┬───────────┘                  └──────────┬───────────┘
                    │                                        │
                    └──────────────────┬─────────────────────┘
                                       │
                                       ▼
                    ┌──────────────────────────────────────┐
                    │         Storage Abstraction           │
                    │                                      │
                    │  ┌────────────┬────────────┬────────┐ │
                    │  │   Linux    │   macOS    │Windows │ │
                    │  │  (Keyring) │ (Keychain) │(CredMgr)│ │
                    │  └────────────┴────────────┴────────┘ │
                    │                                      │
                    │  - Encrypted at rest                 │
                    │  - Platform-native                    │
                    │  - One-time retrieval                │
                    └──────────────────┬───────────────────┘
                                       │
                                       ▼
                    ┌──────────────────────────────────────┐
                    │         Gateway Integration           │
                    │                                      │
                    │  - Environment injection             │
                    │  - systemd/launchd hooks             │
                    │  - Graceful restart                  │
                    │  - Status monitoring                 │
                    └──────────────────┬───────────────────┘
                                       │
                                       ▼
                    ┌──────────────────────────────────────┐
                    │        OpenClaw Gateway               │
                    │                                      │
                    │  Secrets as environment variables:   │
                    │  - OPENAI_API_KEY=***                │
                    │  - DISCORD_BOT_TOKEN=***             │
                    │  - CUSTOM_API_KEY=***                │
                    └──────────────────────────────────────┘

                  ← AI NEVER SEES SECRETS HERE ←
```

## 3. Module Structure

```
clawvault/
├── src/
│   ├── cli/
│   │   ├── index.ts              # CLI entry point
│   │   ├── commands/
│   │   │   ├── add.ts            # Add secret
│   │   │   ├── list.ts           # List secrets
│   │   │   ├── remove.ts         # Remove secret
│   │   │   ├── rotate.ts         # Rotate secret
│   │   │   └── serve.ts          # Web UI server
│   │   └── utils/
│   │       ├── config.ts         # Config loader
│   │       └── validation.ts     # Input validation
│   │
│   ├── storage/
│   │   ├── index.ts              # Storage factory
│   │   ├── interfaces.ts         # Storage interface
│   │   ├── providers/
│   │   │   ├── linux.ts          # GNOME Keyring
│   │   │   ├── macos.ts          # Keychain
│   │   │   ├── windows.ts        # Credential Manager
│   │   │   └── fallback.ts       # File-based (dev only)
│   │   └── audit.ts              # Audit logging
│   │
│   ├── gateway/
│   │   ├── index.ts              # Gateway integration
│   │   ├── environment.ts        # Environment injection
│   │   └── systemd.ts            # Systemd service manager
│   │
│   ├── web/
│   │   ├── index.ts              # Web UI server
│   │   ├── routes/
│   │   │   ├── submit.ts         # Secret submission
│   │   │   └── status.ts         # Service status
│   │   └── templates/
│   │       └── form.html         # Submission form
│   │
│   ├── config/
│   │   ├── index.ts              # Config loader
│   │   ├── schemas.ts            # Validation schemas
│   │   └── defaults.ts           # Default secrets
│   │
│   └── types/
│       └── index.ts              # TypeScript types
│
├── test/
│   ├── unit/
│   │   ├── storage/
│   │   ├── gateway/
│   │   └── config/
│   ├── integration/
│   │   ├── e2e.ts
│   │   └── cross-platform.ts
│   └── security/
│       └── context-leak.ts      # Verify no AI context leak
│
├── docs/
│   ├── SECURITY.md               # Security guarantees
│   ├── ARCHITECTURE.md           # Detailed architecture
│   ├── API.md                    # API reference
│   └── CONTRIBUTING.md           # Contribution guidelines
│
├── .clawhub/
│   └── SKILL.md                  # OpenClaw skill manifest
│
├── package.json
├── tsconfig.json
├── README.md
└── DESIGN.md                     # This document
```

## 4. Security Guarantees & Limitations

### ✅ What's Protected

1. **AI Context Isolation**
   - Secrets NEVER pass through AI model context
   - AI receives only secret IDs, not values
   - Model providers never see secret values

2. **Encrypted Storage**
   - All secrets stored in OS-native encrypted keyrings
   - Platform-native encryption (Linux: keyring, macOS: Keychain, Windows: Credential Manager)
   - No plaintext secrets in config files

3. **Log Isolation**
   - Secrets never appear in OpenClaw chat logs
   - Secrets never appear in gateway logs
   - Audit logs record metadata only (what secret, when, by whom - never the value)

4. **Transmission Security**
   - Web UI uses HTTPS/TLS
   - Local loopback binding by default
   - Optional Tailscale/ngrok tunnel support

### ⚠️ Limitations (Honest Disclosure)

1. **Gateway Environment**
   - Secrets exist as environment variables in the OpenClaw Gateway process
   - Could be exposed via process inspection (ps, /proc, etc.)
   - Mitigation: Document this limitation, recommend running Gateway as separate user

2. **Web UI Exposure**
   - If web server is exposed to network (beyond localhost), secrets in transit
   - Mitigation: Default to localhost only, require explicit flag for network binding

3. **OS Keyring Access**
   - Anyone with OS user access can potentially access keyring
   - Mitigation: Document requirement for secure user accounts, optional keyring password

4. **No Multi-User Access Control**
   - Designed for single-user scenario
   - Mitigation: Clearly document this limitation, recommend enterprise Vault for multi-user

5. **No Hardware Security Modules**
   - No HSM support
   - Mitigation: This is out-of-scope for MVP; document future enhancement path

### 🔒 Security Principles

1. **Zero AI Exposure** - Secrets never enter AI context (non-negotiable)
2. **Defense in Depth** - Keyring encryption + HTTPS + log isolation
3. **Least Privilege** - Gateway only gets secrets it needs
4. **Fail Securely** - If secret can't be retrieved, fail closed
5. **Audit Everything** - Log all secret access (metadata only, never values)

## 5. Platform Support Strategy

### Linux (Primary Support)

**Provider:** GNOME Keyring via `secret-tool`

**Requirements:**
- `libsecret-tools` package
- Running keyring daemon (usually included in desktop environments)
- Optional: `gnome-keyring` daemon for headless setups

**Detection:**
```typescript
const isLinux = process.platform === 'linux'
const hasSecretTool = commandExists('secret-tool')
```

**Storage Schema:**
```
service: "clawvault"
key: "<SECRET_NAME>"
label: "ClawVault: <SECRET_DESCRIPTION>"
```

### macOS (Primary Support)

**Provider:** Keychain via `security` command

**Requirements:**
- macOS built-in keychain
- No additional dependencies

**Detection:**
```typescript
const isMacOS = process.platform === 'darwin'
const hasSecurity = commandExists('security')
```

**Storage Schema:**
```
account: "clawvault"
service: "<SECRET_NAME>"
label: "ClawVault: <SECRET_DESCRIPTION>"
```

### Windows (Secondary Support)

**Provider:** Windows Credential Manager via `cmdkey`

**Requirements:**
- Windows 7+
- Credential Manager (built-in)

**Detection:**
```typescript
const isWindows = process.platform === 'win32'
const hasCmdkey = commandExists('cmdkey')
```

**Storage Schema:**
```
/target:clawvault /user:<SECRET_NAME>
```

### Fallback (Development Only)

**Provider:** Encrypted JSON file

**Use Case:**
- Development/testing on unsupported platforms
- Should never be used in production

**Encryption:**
- AES-256-GCM
- Key derived from user's OS login credential

**Warning:** Must display prominent warning when used.

## 6. Dynamic Secret Configuration

### Configuration Format (JSON)

**Location:** `~/.config/clawvault/secrets.json`

```json
{
  "version": 1,
  "secrets": {
    "OPENAI_API_KEY": {
      "description": "OpenAI API key for GPT models",
      "environmentVar": "OPENAI_API_KEY",
      "provider": "openai",
      "required": false,
      "rotation": {
        "enabled": false,
        "maxAgeDays": 90
      },
      "validation": {
        "pattern": "^sk-",
        "minLength": 20
      },
      "gateways": ["main", "backup"]
    },
    "DISCORD_BOT_TOKEN": {
      "description": "Discord bot token for slash commands",
      "environmentVar": "DISCORD_BOT_TOKEN",
      "provider": "discord",
      "required": true,
      "rotation": {
        "enabled": true,
        "maxAgeDays": 30
      },
      "validation": {
        "pattern": "^[A-Za-z0-9_\\\\-.]+$",
        "minLength": 50
      },
      "gateways": ["main"]
    },
    "CUSTOM_API_KEY": {
      "description": "Custom API key for internal services",
      "environmentVar": "CUSTOM_API_KEY",
      "provider": "custom",
      "required": false,
      "gateways": ["main"]
    }
  },
  "gateway": {
    "restartOnUpdate": true,
    "services": [
      "openclaw-gateway.service"
    ]
  }
}
```

### Adding Secrets On-Demand

**CLI:**
```bash
clawvault add MY_API_KEY --description "My custom API key"
```

**Creates entry:**
```json
{
  "MY_API_KEY": {
    "description": "My custom API key",
    "environmentVar": "MY_API_KEY",
    "provider": "custom",
    "required": false,
    "gateways": ["main"]
  }
}
```

### Template System

**Built-in templates:**
```bash
clawvault add OPENAI_API_KEY --template openai
clawvault add ANTHROPIC_API_KEY --template anthropic
clawvault add GOOGLE_OAUTH --template google-oauth
```

## 7. CLI Command Specification

### Core Commands

```bash
# Add a secret (interactive prompt)
clawvault add <SECRET_NAME>
clawvault add <SECRET_NAME> --description "Description"
clawvault add <SECRET_NAME> --value "secret-value"
clawvault add <SECRET_NAME> --template <template-name>

# List all secrets
clawvault list
clawvault list --verbose          # Show all metadata
clawvault list --status           # Show storage status

# Remove a secret
clawvault remove <SECRET_NAME>
clawvault remove <SECRET_NAME> --confirm

# Rotate a secret (update value)
clawvault rotate <SECRET_NAME>
clawvault rotate <SECRET_NAME> --value "new-value"

# Start web UI server
clawvault serve
clawvault serve --port 3001
clawvault serve --host 0.0.0.0
clawvault serve --tls              # Enable HTTPS
clawvault serve --allow-tunnel    # Allow Tailscale/ngrok tunneling

# Check status
clawvault status
clawvault status --health-check    # Verify keyring access

# Manage configuration
clawvault config
clawvault config reload           # Reload config file
clawvault config export            # Export to JSON (encrypted)
clawvault config import <file>     # Import from JSON (encrypted)

# Audit logs
clawvault audit
clawvault audit --last 7d
clawvault audit --secret OPENAI_API_KEY
```

### Advanced Commands

```bash
# Gateway integration
clawvault gateway inject           # Inject secrets into gateway
clawvault gateway restart          # Restart gateway after secret changes

# Backup/Restore
clawvault backup                   # Backup to encrypted file
clawvault restore <backup-file>    # Restore from backup

# Security
clawvault validate                 # Validate all secrets
clawvault expire                   # Check for expired secrets
```

## 8. API Surface

### JavaScript/TypeScript API

```typescript
import { ClawVault } from 'clawvault'

// Initialize
const vault = new ClawVault({
  configPath: '~/.config/clawvault/secrets.json',
  platform: 'auto'  // auto-detect Linux/macOS/Windows
})

// Add secret
await vault.add('MY_API_KEY', {
  value: 'sk-abc123',
  description: 'My API key',
  environmentVar: 'MY_API_KEY'
})

// List secrets
const secrets = await vault.list()
// => [{ name: 'MY_API_KEY', description: '...', status: 'active' }]

// Get secret (never returns value, only metadata)
const metadata = await vault.get('MY_API_KEY')
// => { name: 'MY_API_KEY', description: '...', lastRotated: '...' }

// Inject into gateway
await vault.injectToGateway({
  restart: true,
  services: ['openclaw-gateway.service']
})

// Audit log
const audit = await vault.audit({
  secret: 'MY_API_KEY',
  since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)  // Last 7 days
})

// Web UI server
const server = await vault.serve({
  port: 3000,
  host: 'localhost',
  tls: true
})
await server.close()
```

### Event Emitter

```typescript
vault.on('secret-added', (name) => console.log(`Added: ${name}`))
vault.on('secret-rotated', (name) => console.log(`Rotated: ${name}`))
vault.on('secret-removed', (name) => console.log(`Removed: ${name}`))
vault.on('gateway-injected', () => console.log('Gateway updated'))
vault.on('error', (err) => console.error(err))
```

## 9. Testing Strategy

### Unit Tests

```typescript
// Storage layer tests
describe('Linux Keyring Storage', () => {
  it('should store and retrieve secret', async () => { })
  it('should return null for missing secret', async () => { })
  it('should handle storage errors gracefully', async () => { })
})

describe('macOS Keychain Storage', () => {
  it('should store and retrieve secret', async () => { })
  // ... similar tests
})

// Config validation tests
describe('Config Validation', () => {
  it('should validate valid config', async () => { })
  it('should reject invalid secret name', async () => { })
  it('should reject invalid regex pattern', async () => { })
})
```

### Integration Tests

```typescript
// Cross-platform tests
describe('Cross-Platform Storage', () => {
  it('should auto-detect platform', async () => { })
  it('should fallback gracefully', async () => { })
})

// Gateway integration tests
describe('Gateway Integration', () => {
  it('should inject secrets into environment', async () => { })
  it('should restart gateway on update', async () => { })
})
```

### Security Tests (Critical)

```typescript
// Verify NO secrets in AI context
describe('AI Context Isolation', () => {
  it('should never include secret in error messages', async () => { })
  it('should never log secret value', async () => { })
  it('should only return metadata from get()', async () => { })
  it('should strip secrets from audit logs', async () => { })
})

// Transmission security
describe('Web UI Security', () => {
  it('should use HTTPS when TLS enabled', async () => { })
  it('should bind to localhost by default', async () => { })
  it('should reject unencrypted HTTP when TLS required', async () => { })
})

// Keyring security
describe('Keyring Security', () => {
  it('should store secret in encrypted keyring', async () => { })
  it('should require keyring unlock', async () => { })
  it('should not write plaintext to disk', async () => { })
})
```

### End-to-End Tests

```typescript
describe('E2E: Secret Lifecycle', () => {
  it('should add, list, inject, rotate, remove', async () => {
    await vault.add('TEST_KEY', { value: 'test123', description: 'Test' })
    const list = await vault.list()
    expect(list).toContain('TEST_KEY')

    await vault.injectToGateway({ restart: false })
    const env = process.env['TEST_KEY']
    expect(env).toBeUndefined()  // Should not be in process env

    await vault.rotate('TEST_KEY', { value: 'test456' })

    await vault.remove('TEST_KEY')
    const removed = await vault.list()
    expect(removed).not.toContain('TEST_KEY')
  })
})
```

### Test Coverage Goals

- **Unit tests:** 90%+ coverage
- **Integration tests:** 80%+ coverage
- **Security tests:** 100% of critical paths
- **E2E tests:** Main user workflows

## 10. Documentation Plan

### User Documentation

1. **README.md** (Root)
   - Quick start guide
   - Installation instructions
   - Basic usage examples
   - Security guarantees summary

2. **docs/SECURITY.md**
   - Detailed security guarantees
   - Known limitations
   - Threat model
   - Best practices

3. **docs/ARCHITECTURE.md**
   - System architecture
   - Module responsibilities
   - Data flow diagrams

4. **docs/API.md**
   - CLI command reference
   - TypeScript API reference
   - Event emitter API

5. **docs/CONFIGURATION.md**
   - Configuration format
   - Secret templates
   - Gateway integration

6. **docs/PLATFORMS.md**
   - Platform-specific setup
   - Keyring requirements
   - Troubleshooting

### Developer Documentation

1. **docs/CONTRIBUTING.md**
   - Development setup
   - Code style guidelines
   - Testing guidelines
   - Pull request process

2. **docs/DEVELOPMENT.md**
   - Module structure
   - Adding new storage providers
   - Adding new secret templates
   - Security review checklist

3. **docs/RELEASE.md**
   - Release process
   - Versioning strategy
   - Changelog format

### OpenClaw Skill Documentation

1. **.clawhub/SKILL.md**
   - Skill description
   - Installation instructions
   - Usage examples
   - Security considerations

## 11. Implementation Phases

### Phase 1: Core Storage (Days 1-2)
- Platform detection
- Linux keyring integration
- Basic CRUD operations
- Unit tests

### Phase 2: Configuration System (Days 2-3)
- Dynamic secret definitions
- Config loader
- Validation schemas
- Template system

### Phase 3: Gateway Integration (Days 3-4)
- Environment injection
- Systemd integration
- Gateway restart hooks
- Integration tests

### Phase 4: Web UI (Days 4-5)
- Express server
- Secret submission form
- TLS support
- Security tests

### Phase 5: CLI Tool (Days 5-6)
- Command parsing
- Interactive prompts
- Help text
- E2E tests

### Phase 6: Cross-Platform (Days 6-7)
- macOS Keychain integration
- Windows Credential Manager
- Fallback storage
- Cross-platform tests

### Phase 7: Polish & Docs (Days 7-8)
- Security audit
- Documentation
- OpenClaw skill packaging
- Release preparation

## 12. Success Criteria

- ✅ Secrets NEVER enter AI context (verified via security tests)
- ✅ Platform-agnostic keyring support (Linux, macOS, Windows)
- ✅ Dynamic secret definitions (no hardcoded limits)
- ✅ Web UI for secure submission
- ✅ Comprehensive test coverage (90%+)
- ✅ Clear documentation of security guarantees and limitations
- ✅ Published to ClawHub with working examples
- ✅ Production-ready for single-user scenarios

## 13. Future Enhancements (Post-MVP)

- HashiCorp Vault integration path
- Secret rotation automation
- Multi-user access control
- Hardware security module (HSM) support
- Webhook notifications on secret changes
- GUI desktop application
- Secret sharing between authorized instances
- Advanced audit analytics
- Backup/restore with cloud storage
