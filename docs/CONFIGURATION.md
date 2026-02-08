# ClawVault Configuration Guide

## Overview

ClawVault uses a configuration file to define secret metadata and gateway settings. The configuration file contains only secret **definitions** (metadata), not actual secret values. Values are stored securely in the OS keyring.

## Configuration Location

The configuration file is stored at:

```
~/.config/clawvault/secrets.json
```

This file is created automatically on first run with default secret templates.

## Configuration Structure

### Top-Level Schema

```json
{
  "version": 1,
  "secrets": { ... },
  "gateway": { ... }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `version` | number | Configuration version (must be `1`) |
| `secrets` | object | Secret definitions keyed by name |
| `gateway` | object | Gateway integration settings |

### Secret Definition

Each secret in the `secrets` object has the following schema:

```json
{
  "OPENAI_API_KEY": {
    "description": "OpenAI API key for GPT models",
    "environmentVar": "OPENAI_API_KEY",
    "provider": "openai",
    "required": false,
    "gateways": ["main"],
    "rotation": { ... },
    "validation": { ... }
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `description` | string | Yes | Human-readable description of the secret |
| `environmentVar` | string | Yes | Target environment variable name |
| `provider` | string | Yes | Service provider identifier |
| `required` | boolean | Yes | Whether the secret is required |
| `gateways` | array | Yes | List of gateway names to inject into |
| `rotation` | object | No | Rotation configuration |
| `validation` | object | No | Validation rules |

### Gateway Configuration

```json
{
  "gateway": {
    "restartOnUpdate": true,
    "services": ["openclaw-gateway.service"]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `restartOnUpdate` | boolean | Whether to restart services after secret injection |
| `services` | array | List of systemd/launchd service names to manage |

## Secret Name Validation

Secret names must follow these rules:

1. Must start with an uppercase letter (A-Z)
2. Can contain uppercase letters, numbers, and underscores only
3. Matches pattern: `/^[A-Z][A-Z0-9_]*$/`

**Valid names:**
- `OPENAI_API_KEY`
- `DISCORD_BOT_TOKEN`
- `MY_API_KEY_2`

**Invalid names:**
- `openai_api_key` (lowercase)
- `My-Api-Key` (hyphens, mixed case)
- `2API_KEY` (starts with number)

## Rotation Configuration

Optional rotation settings for a secret:

```json
{
  "rotation": {
    "enabled": true,
    "maxAgeDays": 90,
    "intervalDays": 30
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | boolean | Whether rotation is enabled |
| `maxAgeDays` | number | Maximum age before rotation required |
| `intervalDays` | number | Suggested rotation interval |

## Validation Configuration

Optional validation rules for secret values:

```json
{
  "validation": {
    "pattern": "^sk-[a-zA-Z0-9]{48}$",
    "minLength": 51,
    "maxLength": 51
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `pattern` | string | Regex pattern to match (as string) |
| `minLength` | number | Minimum length |
| `maxLength` | number | Maximum length |

## Default Secret Templates

ClawVault includes pre-defined templates for common services:

### OPENAI_API_KEY

```json
{
  "description": "OpenAI API key for GPT models (GPT-4, GPT-3.5, etc.)",
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
```

### ANTHROPIC_API_KEY

```json
{
  "description": "Anthropic API key for Claude models",
  "environmentVar": "ANTHROPIC_API_KEY",
  "provider": "anthropic",
  "required": false,
  "gateways": ["main"],
  "validation": {
    "pattern": "^sk-ant-[a-zA-Z0-9_-]{95}$",
    "minLength": 100,
    "maxLength": 100
  }
}
```

### GEMINI_API_KEY

```json
{
  "description": "Google Gemini API key for Gemini models",
  "environmentVar": "GEMINI_API_KEY",
  "provider": "google",
  "required": false,
  "gateways": ["main"],
  "validation": {
    "minLength": 30
  }
}
```

### DISCORD_BOT_TOKEN

```json
{
  "description": "Discord bot token for bot commands and interactions",
  "environmentVar": "DISCORD_BOT_TOKEN",
  "provider": "discord",
  "required": false,
  "gateways": ["main"],
  "validation": {
    "pattern": "^[A-Za-z0-9_\\-.]{50,}$",
    "minLength": 50
  }
}
```

## Adding Custom Secrets

### Via CLI

The easiest way to add secrets is via the CLI:

```bash
# Add a secret with default template
clawvault add OPENAI_API_KEY

# Add a custom secret
clawvault add MY_CUSTOM_KEY -p myservice
```

### Manually Editing

You can also edit the configuration file directly:

1. Open `~/.config/clawvault/secrets.json` in your editor
2. Add your secret definition to the `secrets` object
3. Validate the JSON syntax
4. Save the file

Example:

```json
{
  "version": 1,
  "secrets": {
    "MY_CUSTOM_API_KEY": {
      "description": "My Custom Service API key",
      "environmentVar": "MY_CUSTOM_API_KEY",
      "provider": "myservice",
      "required": false,
      "gateways": ["main"],
      "validation": {
        "pattern": "^mykey_[a-zA-Z0-9]{32}$",
        "minLength": 37
      }
    }
  },
  "gateway": {
    "restartOnUpdate": true,
    "services": ["openclaw-gateway.service"]
  }
}
```

### Via API

```typescript
import { addSecretDefinition } from 'clawvault/config'

await addSecretDefinition('MY_CUSTOM_KEY', {
  description: 'My Custom Service API key',
  environmentVar: 'MY_CUSTOM_API_KEY',
  provider: 'myservice',
  required: false,
  gateways: ['main']
})
```

## Gateway Configuration

### Systemd Services

For Linux systems using systemd:

```json
{
  "gateway": {
    "restartOnUpdate": true,
    "services": [
      "openclaw-gateway.service",
      "openclaw-worker.service"
    ]
  }
}
```

When secrets are updated, ClawVault will:
1. Import environment variables to the systemd user session
2. Restart each listed service

### Disabling Auto-Restart

To disable automatic service restart:

```json
{
  "gateway": {
    "restartOnUpdate": false,
    "services": ["openclaw-gateway.service"]
  }
}
```

Secrets will still be injected into the environment, but services won't restart automatically.

## Multiple Gateways

You can configure secrets for multiple gateway instances:

```json
{
  "secrets": {
    "OPENAI_API_KEY": {
      "gateways": ["main", "backup", "development"]
    },
    "DEVELOPMENT_KEY": {
      "gateways": ["development"]
    }
  },
  "gateway": {
    "restartOnUpdate": true,
    "services": ["openclaw-gateway.service"]
  }
}
```

## Configuration Validation

ClawVault validates the configuration on every load. Common validation errors:

### Invalid Secret Name

```
Error: Invalid secret name "my_key". Must match pattern: /^[A-Z][A-Z0-9_]*$/
```

**Solution**: Rename to use uppercase and underscores only (e.g., `MY_KEY`)

### Missing Required Field

```
Error: secrets.OPENAI_API_KEY.description must be a non-empty string
```

**Solution**: Add the missing required field

### Invalid Gateway Configuration

```
Error: gateway.services must be an array
```

**Solution**: Ensure `services` is an array, even if empty

## Environment Variable Mapping

By default, a secret is injected as an environment variable with the same name. You can customize this:

```json
{
  "secrets": {
    "MY_OPENAI_KEY": {
      "environmentVar": "OPENAI_API_KEY",
      "provider": "openai",
      "required": false,
      "gateways": ["main"]
    }
  }
}
```

In this example, the secret is stored as `MY_OPENAI_KEY` but injected as `OPENAI_API_KEY`.

## Reloading Configuration

Configuration changes are automatically picked up by:
- CLI commands (reload on each execution)
- Web UI server (requires restart)

To reload in a long-running process:

```typescript
import { reloadConfig } from 'clawvault/config'

const newConfig = await reloadConfig()
```

## Backup and Migration

### Backup

```bash
# Backup configuration
cp ~/.config/clawvault/secrets.json ~/.config/clawvault/secrets.json.backup

# Backup secrets from keyring (Linux)
secret-tool lookup service clawvault key SECRET_NAME > backup.txt
```

### Migration

To migrate to a new machine:

1. Copy the configuration file: `~/.config/clawvault/secrets.json`
2. Re-enter secret values via CLI: `clawvault add <name>`
3. Or export/import keyring data (platform-specific)

## Troubleshooting

### Configuration Not Found

If the configuration doesn't exist, ClawVault creates a default one. To customize:

```bash
# Edit the config
nano ~/.config/clawvault/secrets.json
```

### Validation Errors

To debug validation errors:

```typescript
import { validateConfigDetailed } from 'clawvault/config'

const result = validateConfigDetailed(yourConfig)
if (!result.valid) {
  console.error('Validation errors:', result.errors)
}
```

### Secret Not Injecting

Check that:
1. The secret exists in the keyring: `clawvault list`
2. The secret definition exists in the config
3. The `environmentVar` matches what your application expects
4. The gateway service is in the `services` array
