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

---

## Workflows

### Agent Workflow (Non-Interactive)

Agents should **never** prompt the human for secrets. Use `clawvault request` to generate a secure one-time link:

```bash
# Request a secret from the human via one-time web link
clawvault request <name> --label "Describe what this secret is for"

# The human will receive a URL to securely provide the secret
# The value NEVER enters shell history or AI context

# List stored secrets (names only)
clawvault list

# Check if a specific secret exists
clawvault list | grep <name>

# Rotate (update) a secret
clawvault request <name> --label "Update existing secret"
```

**Warning - Automation Only:** The `--value` and `--stdin` flags are provided for automation scripts but should NEVER be used by agents or in interactive contexts as they expose secrets to shell history and process listings:

```bash
# AUTOMATION ONLY - NOT for agent use
clawvault add <name> --value "secret-value"  # Leaks to shell history!
echo "secret-value" | clawvault add <name> --stdin  # Leaks to process list!
```

---

### Human Workflow (Interactive / Web UI)

Humans can use the interactive CLI prompts or the web UI:

**Option A — Interactive CLI (same machine):**
```bash
clawvault add <name>   # Prompts for value securely (hidden input)
clawvault remove <name> -f && clawvault add <name>  # Update
```

**Option B — One-time web link (remote / shareable):**
```bash
# Generate a secure one-time link to add or update a secret
clawvault request <name> --label "Add My API Key"

# Output includes a URL like: http://localhost:3000/requests/<id>
# For Tailscale access: use tailscale serve to proxy the port first
tailscale serve --bg http://127.0.0.1:3000
# Then access via https://<hostname>.tailnet.ts.net/requests/<id>
```

The link:
- Is single-use and expires after 15 minutes (configurable via `--ttl`)
- Automatically detects whether to **create** or **update** the secret
- **Never** exposes the value in chat or logs

---

### Agent Discovering What Secrets Exist

```bash
# See all stored secret names
clawvault list

# NOTE: clawvault resolve <name> is for OpenClaw exec-provider use ONLY
# Agents should NEVER call resolve directly - it returns secret values
# which would violate the security guarantee of keeping secrets out of AI context
```

---

## OpenClaw Integration (exec provider)

⚠️ **Do NOT use wrapper scripts or environment variable injection.** OpenClaw does not support `${ENV_VAR}` placeholders in `auth-profiles.json`.

1. **Scan** existing plaintext secrets (dry-run only):
   ```bash
   clawvault openclaw migrate --verbose
   ```

2. **Add** secrets to ClawVault:
   ```bash
   # Recommended: Use request for secure one-time link
   clawvault request providers/openai/apiKey --label "OpenAI API Key"

   # Or for automation only (leaks to shell history):
   clawvault add providers/openai/apiKey --value "sk-..."
   ```

3. **Configure** `openclaw.json` to use ClawVault as the secrets provider:
   ```json
   {
     "secrets": {
       "providers": {
         "clawvault": {
           "source": "exec",
           "command": "/absolute/path/to/clawvault",
           "args": ["resolve"],
           "jsonOnly": true,
           "passEnv": ["PATH"]
         }
       }
     }
   }
   ```
   **Important:** `command` must be an absolute path.

4. **Reload** OpenClaw:
   ```bash
   openclaw gateway restart
   ```

---

## CLI Commands Reference

| Command | Description |
|---------|-------------|
| `clawvault add <name> [--value <val> \| --stdin]` | Store a new secret (--value/--stdin: automation only, leaks to history) |
| `clawvault remove <name> [-f]` | Delete a secret |
| `clawvault rotate <name>` | Alias for remove + add (interactive) |
| `clawvault list` | List secret names (values never shown) |
| `clawvault resolve <name>` | Resolve a secret value (exec-provider only, NOT for agent use) |
| `clawvault request <name> [--label text] [--ttl ms]` | Generate a one-time web link (recommended for agents) |
| `clawvault openclaw migrate --verbose` | Scan auth-profiles.json (dry-run) |
| `clawvault serve [-p port] [-H host] [--tls]` | Start web UI server |
| `clawvault doctor` | Diagnose setup issues |

---

## Platform Support

| Platform | Storage Backend | Tools Required |
|----------|-----------------|----------------|
| Linux | GNOME Keyring / systemd-creds | `libsecret-tools` or `systemd` |
| macOS | Keychain Services | Built-in |
| Windows | Credential Manager | Built-in |
| Any | Encrypted File (fallback) | `CLAWVAULT_ALLOW_FALLBACK=1` |

---

## Security Notes

- Secret values are **never** returned by `list` — only names are shown
- The web UI bearer token is printed to **stdout** at server startup
- One-time links are rate-limited and expire automatically
- A direct management dashboard (list + edit inline) is tracked in [GitHub Issue #31](https://github.com/KHAEntertainment/clawvault/issues/31)

---

## Support

- GitHub Issues: https://github.com/KHAEntertainment/clawvault/issues
- Repository: https://github.com/KHAEntertainment/clawvault