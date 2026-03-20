# ClawVault Skill

## Metadata

```yaml
name: clawvault
version: 0.2.0
description: Secure OS-keychain secrets backend for OpenClaw's native secrets management.
author: Billy <billy@openclaw.dev>
license: MIT
homepage: https://github.com/KHAEntertainment/clawvault
```

## Description

ClawVault is an OS-keychain secrets backend for OpenClaw's native secrets management. It stores secrets in the platform credential store (GNOME Keyring, macOS Keychain, Windows Credential Manager) and implements the OpenClaw `exec`-provider resolve protocol.

This allows OpenClaw to fetch secret values at runtime without keeping them in plaintext config files (like `auth-profiles.json`) or chat history.

### Key Security Guarantee

**Secret values NEVER enter AI context.** All secret operations are handled directly through the keyring.

## Migration & Integration Workflow

⚠️ **Do NOT use environment variables or wrapper scripts.** OpenClaw does not support expanding `${ENV_VAR}` placeholders in `auth-profiles.json`. Attempting automated migration that writes placeholders will break authentication.

Instead, use ClawVault as a native OpenClaw `exec` provider:

1. **Scan** existing plaintext secrets:
   ```bash
   clawvault openclaw migrate --verbose
   ```
   *(Use this as a dry-run discovery tool only. Do NOT run with `--apply` unless you know what you are doing.)*

2. **Add** secrets manually:
   ```bash
   clawvault add providers/openai/apiKey
   # (Interactive prompt will ask for the secret)
   ```
   *For non-interactive mode (e.g., from an agent):*
   ```bash
   clawvault add providers/openai/apiKey --value "sk-..."
   # Or via stdin: echo "sk-..." | clawvault add providers/openai/apiKey --stdin
   ```

3. **Configure** OpenClaw to use ClawVault. Edit `openclaw.json`:
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

4. **Reload** OpenClaw:
   ```bash
   openclaw gateway restart
   ```

## CLI Commands

```bash
# Add a new secret to the keyring
clawvault add <name> [--value <val> | --stdin]

# Resolve a secret (used by OpenClaw exec provider)
clawvault resolve <name>

# List all secrets (metadata only)
clawvault list

# Remove a secret
clawvault remove <name> [-f]

# Rotate a secret value
clawvault rotate <name>

# Start web UI server for Confidant-style one-time request links
clawvault serve [-p <port>] [-H <host>] [--tls]

# Dry-run migration scanner for old plaintext setups
clawvault openclaw migrate --verbose
```

## Platform Support

| Platform | Storage Backend | Tools Required |
|----------|-----------------|----------------|
| Linux | GNOME Keyring / systemd-creds | `libsecret-tools` or `systemd` |
| macOS | Keychain Services | Built-in |
| Windows | Credential Manager | Built-in |
| Any | Encrypted File (fallback) | None |

## Support

- GitHub Issues: https://github.com/KHAEntertainment/clawvault/issues
- Repository: https://github.com/KHAEntertainment/clawvault
