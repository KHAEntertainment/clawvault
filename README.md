# ClawVault

Secure secret management for OpenClaw that stores secrets in OS-native encrypted keyrings and injects them into the Gateway environment.

## Security Guarantee

**ClawVault ensures secrets NEVER enter the AI context.** Secret values are:
- Stored only in encrypted platform keyrings (GNOME Keyring, macOS Keychain, Windows Credential Manager)
- Injected directly into the Gateway process environment via systemd
- Never logged, never included in error messages, never exposed to AI models

## Installation

### Quick Install

```bash
npm install -g clawvault
```

### Verify Installation

```bash
clawvault --version
# Output: 0.1.0
```

### Check Dependencies

After installation, run the doctor command to verify system dependencies:

```bash
clawvault doctor
```

**Expected output:**
```
✓ GNOME Keyring storage    (Linux) / ✓ macOS Keychain (macOS) / ✓ Credential Manager (Windows)
✓ Systemd integration (optional)
```

**If dependencies are missing:**
```
✗ GNOME Keyring storage
  Installation: Debian/Ubuntu: sudo apt install libsecret-tools
```

### Installing System Dependencies

⚠️ **Important:** System dependency installation requires `sudo` and must be done manually.

**Why?** OpenClaw typically runs as a non-privileged user. We do not automate sudo commands for security reasons. Install dependencies using your admin account.

**Linux (libsecret-tools):**
```bash
# Debian/Ubuntu
sudo apt install libsecret-tools

# Fedora/RHEL
sudo dnf install libsecret

# Arch Linux
sudo pacman -S libsecret
```

**macOS:**
- Built-in keychain - no installation needed
- If you see warnings, your keychain may be locked

**Windows:**
- Built-in Credential Manager - no installation needed

After installing, run `clawvault doctor` again to verify.

### Build from Source

```bash
git clone https://github.com/openclaw/clawvault.git
cd clawvault
npm install
npm run build
npm link
```

## Quick Start

```bash
# Check dependencies (recommended after install)
clawvault doctor

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

# Migrate OpenClaw plaintext auth-profiles to encrypted storage
clawvault openclaw migrate --apply
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

| Platform | Backend | Command |
|----------|---------|---------|
| Linux | GNOME Keyring | `secret-tool` |
| macOS | Keychain | `security` |
| Windows | Credential Manager | `cmdkey` |
| Fallback | Encrypted file | (development only) |

### Gateway Injection

```bash
# ClawVault injects secrets to systemd user environment
systemctl --user set-environment OPENAI_API_KEY=sk-...

# Gateway imports and starts
systemctl --user import-environment OPENAI_API_KEY
systemctl --user start openclaw-gateway.service
```

## Configuration

Secret definitions are stored in `~/.config/clawvault/secrets.json`:

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
