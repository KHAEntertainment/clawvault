# ClawVault Release Notes

## Version 1.0.0

Release Date: TBD

### Overview

ClawVault 1.0.0 is the initial stable release of the secure secret management system for OpenClaw. This release provides complete cross-platform support with encrypted keyring storage, web UI, and CLI tool.

### What's New

#### Core Features

- **Secure Storage**: Secrets stored in OS-native encrypted keyrings
  - Linux: GNOME Keyring (libsecret)
  - macOS: Keychain Services
  - Windows: Credential Manager
  - Fallback: AES-256-GCM encrypted file storage

- **AI Context Isolation**: Secret values NEVER enter AI context
  - CLI uses hidden input prompts
  - Web UI submits directly to keyring
  - Only metadata exposed in logs and responses

- **Configuration System**: Dynamic secret definitions
  - JSON config at `~/.config/clawvault/secrets.json`
  - Pre-defined templates for common services
  - Validation rules for secret values

- **Gateway Integration**: Automatic injection to OpenClaw Gateway
  - systemd user session integration
  - Automatic service restart on update
  - Environment variable mapping

- **Web UI**: HTTP interface for secret submission
  - Simple HTML form
  - RESTful API endpoints
  - Optional HTTPS support

- **CLI Tool**: Command-line interface
  - `add`: Add secrets with hidden input
  - `list`: List secrets (metadata only)
  - `remove`: Remove secrets with confirmation
  - `rotate`: Update secret values
  - `serve`: Start web UI server

#### Security Features

- Audit logging (metadata only)
- Config file contains only definitions, not values
- Shell history protection via hidden input
- Command injection prevention
- Platform-native encryption

### Installation

```bash
npm install -g clawvault
```

### Quick Start

```bash
# Add a secret
clawvault add OPENAI_API_KEY

# List secrets
clawvault list

# Start web UI
clawvault serve
```

### Platform Requirements

**Linux:**
```bash
sudo apt-get install libsecret-tools
```

**macOS:**
No additional requirements

**Windows:**
No additional requirements

### Breaking Changes

None - this is the initial release.

### Deprecated Features

None

### Known Issues

1. **Linux headless servers**: GNOME Keyring may require manual unlock
2. **Windows credential retrieval**: Uses PowerShell parsing which may vary by version
3. **Fallback storage**: Emits warning but less secure than platform keyring

### Migration Guide

No migration needed for new installations.

### Security Considerations

- Secrets in gateway process memory can be exposed via process inspection
- Web UI defaults to HTTP; use `--tls` for network exposure
- Fallback storage is weaker than platform keyring

See `docs/SECURITY.md` for full security model.

### Documentation

- `docs/SECURITY.md` - Security model and threat analysis
- `docs/ARCHITECTURE.md` - System architecture overview
- `docs/API.md` - Complete API reference
- `docs/CONFIGURATION.md` - Configuration guide
- `docs/PLATFORMS.md` - Platform-specific notes
- `docs/CONTRIBUTING.md` - Contributing guidelines

### Contributors

- Billy (@billy) - Project lead

### License

MIT License - see LICENSE file for details

---

## Version History

### 1.0.0 (2024-01-15)

- Initial stable release
- Cross-platform keyring support
- CLI tool and web UI
- Gateway integration
- Complete documentation

### 0.1.0 (2024-01-01)

- Initial development version
- Basic storage layer
- Platform detection
