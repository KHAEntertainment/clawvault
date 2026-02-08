# ClawVault Platform-Specific Notes

## Overview

ClawVault supports multiple platforms with automatic detection of the best available storage provider. This document covers platform-specific requirements, limitations, and troubleshooting.

## Supported Platforms

| Platform | Keyring Backend | Status | Tools Required |
|----------|-----------------|--------|----------------|
| Linux | GNOME Keyring / libsecret | Full Support | `secret-tool` |
| macOS | Keychain Services | Full Support | Built-in |
| Windows | Credential Manager | Full Support | Built-in |
| Any | Encrypted File | Fallback | None |

## Linux

### Storage Provider: `LinuxKeyringProvider`

Uses GNOME Keyring via the `secret-tool` command-line utility.

### Requirements

Install the libsecret tools:

```bash
# Debian/Ubuntu
sudo apt-get install libsecret-tools

# Fedora/RHEL
sudo dnf install libsecret-tools

# Arch Linux
sudo pacman -S libsecret
```

### Keyring Schema

Secrets are stored with these attributes:

| Attribute | Value |
|-----------|-------|
| `service` | `clawvault` |
| `key` | `<SECRET_NAME>` (e.g., `OPENAI_API_KEY`) |
| `--label` | `ClawVault: <SECRET_NAME>` |

### Commands Used

```bash
# Store
echo -n "VALUE" | secret-tool store --label="ClawVault: NAME" service "clawvault" key "NAME"

# Retrieve
secret-tool lookup service "clawvault" key "NAME" 2>/dev/null

# Delete
secret-tool remove service "clawvault" key "NAME"

# List (via gdbus)
gdbus call --session --dest org.freedesktop.secrets \
  --object-path /org/freedesktop/secrets/collections/login \
  --method org.freedesktop.Secret.Service.SearchItems \
  "{'service': <'clawvault'>}"
```

### Limitations

- Requires a running GNOME Keyring daemon (or compatible)
- Keyring must be unlocked (typically unlocked at login)
- `secret-tool` must be in `$PATH`

### Troubleshooting

**"secret-tool: command not found"**
```bash
# Install libsecret-tools
sudo apt-get install libsecret-tools
```

**"Error communicating with the secret service"**
```bash
# Ensure GNOME Keyring is running
gnome-keyring-daemon --start

# Or unlock the keyring
secret-tool lookup clawvault test || true
```

### Headless Servers

For headless Linux servers without GNOME:

```bash
# Setup keyring for headless use
echo "your-password" | gnome-keyring-daemon --unlock

# Or use a display manager that auto-unlocks at login
```

## macOS

### Storage Provider: `MacOSKeychainProvider`

Uses the built-in macOS Keychain Services via the `security` command.

### Requirements

No installation required - uses built-in `security` command.

### Keychain Schema

Secrets are stored with these attributes:

| Attribute | Value |
|-----------|-------|
| `-a` (account) | `clawvault` |
| `-s` (service) | `<SECRET_NAME>` |
| `-D` (type/label) | `ClawVault: <SECRET_NAME>` |

### Commands Used

```bash
# Store
security add-generic-password -a "clawvault" -s "NAME" -w "VALUE" -D "ClawVault: NAME"

# Retrieve
security find-generic-password -a "clawvault" -s "NAME" -w 2>/dev/null

# Delete
security delete-generic-password -a "clawvault" -s "NAME" 2>/dev/null

# List
security dump-keychain | grep -A 10 "acct\"clawvault\""
```

### Keychain Location

Secrets are stored in the user's default keychain (typically `~/Library/Keychains/login.keychain-db`).

### Limitations

- Requires user keychain to be unlocked (typically at login)
- First use may prompt for Keychain access permission
- Touch ID/Apple Watch unlock can be used if enabled

### Troubleshooting

**"security: SecKeychainItemImport: The user name or passphrase you entered is not correct"**

Your keychain is locked. Unlock it:
```bash
security unlock-keychain ~/Library/Keychains/login.keychain-db
```

**Access Denied Prompts**

First-time use may prompt for permission. Grant it to allow ClawVault to access the keychain.

**List All ClawVault Secrets**

```bash
security dump-keychain | grep -A 3 "acct\"clawvault\""
```

## Windows

### Storage Provider: `WindowsCredentialManager`

Uses the built-in Windows Credential Manager via `cmdkey` and PowerShell.

### Requirements

No installation required - uses built-in `cmdkey` command.

### Credential Schema

Secrets are stored with these attributes:

| Attribute | Value |
|-----------|-------|
| `/target` | `clawvault` |
| `/user` | `<SECRET_NAME>` |
| `/pass` | `<SECRET_VALUE>` |

### Commands Used

```bash
# Store
cmdkey /generic:clawvault /user:NAME /pass:VALUE

# Retrieve (via PowerShell)
powershell -Command "cmdkey /list:clawvault | Select-String ..."

# Delete
cmdkey /delete:clawvault /user:NAME

# List
cmdkey /list:clawvault
```

### Credential Manager Location

Credentials are stored in the Windows Credential Manager:
- `Control Panel > User Accounts > Credential Manager > Windows Credentials`
- Target: `clawvault`

### Limitations

- `cmdkey` cannot retrieve passwords directly
- Uses PowerShell to parse `cmdkey /list` output
- Credentials are encrypted with Windows DPAPI

### Troubleshooting

**"Cannot find cmdkey"**

Ensure `cmdkey` is in `$PATH` (built-in to Windows).

**List All ClawVault Credentials**

```cmd
cmdkey /list:clawvault
```

**Manually View Credentials**

1. Open Control Panel
2. Navigate to: `User Accounts > Credential Manager`
3. Click `Windows Credentials`
4. Look for entries with `Target: clawvault`

**PowerShell Execution Policy**

If PowerShell scripts are restricted:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

## Fallback Storage

### Storage Provider: `FallbackProvider`

Encrypted file storage used when no platform keyring is available.

### When It's Used

Fallback is activated when:
- Platform keyring tools are not installed
- Platform detection fails
- Explicitly requested for testing

### Warning Message

```
╔════════════════════════════════════════════════════════════╗
║  WARNING: Using fallback encrypted file storage          ║
║  This is less secure than platform keyring storage.       ║
║  Install your platform keyring tools for better security.  ║
║                                                            ║
║  Linux:   libsecret-tools (apt install libsecret-tools)    ║
║  macOS:   Built-in keychain (no installation needed)       ║
║  Windows: Built-in Credential Manager (no install needed)  ║
╚════════════════════════════════════════════════════════════╝
```

### File Locations

| File | Location | Purpose |
|------|----------|---------|
| Encrypted storage | `~/.clawvault/secrets.enc.json` | AES-256-GCM encrypted secrets |
| Salt | `~/.clawvault/.salt` | Key derivation salt |

### Encryption Details

- **Algorithm**: AES-256-GCM
- **Key Derivation**: scrypt with machine/user-specific salt
- **File Permissions**: `0600` (user read/write only)

### Limitations

- Weaker than platform keyring (file-based)
- Depends on file system permissions
- Encryption tied to machine + user

### Security Considerations

The fallback storage uses:
- `scrypt` for key derivation (memory-hard, resistant to brute force)
- AES-256-GCM for authenticated encryption
- Machine-specific salt prevents copying encrypted file to another machine

However, it's still less secure than:
- macOS Keychain (hardware Secure Enclave when available)
- Windows Credential Manager (DPAPI with user credentials)
- GNOME Keyring (encrypted with login password)

### Migrating from Fallback

To migrate from fallback to platform keyring:

```bash
# Install platform tools (Linux example)
sudo apt-get install libsecret-tools

# List current secrets
clawvault list

# Re-add each secret (they'll be stored in keyring now)
clawvault add OPENAI_API_KEY
```

Then remove the fallback files:
```bash
rm ~/.clawvault/secrets.enc.json
rm ~/.clawvault/.salt
```

## Platform Detection

ClawVault automatically detects the best available provider:

```typescript
interface PlatformInfo {
  platform: NodeJS.Platform  // 'linux', 'darwin', 'win32'
  hasKeyring: boolean        // Whether keyring tools are available
  provider: 'linux' | 'macos' | 'windows' | 'fallback'
}
```

### Detection Logic

```bash
# Linux
if platform === 'linux' and command -v secret-tool:
    provider = 'linux'
else:
    provider = 'fallback'

# macOS
if platform === 'darwin' and command -v security:
    provider = 'macos'
else:
    provider = 'fallback'

# Windows
if platform === 'win32' and where cmdkey:
    provider = 'windows'
else:
    provider = 'fallback'
```

### Checking Your Platform

```bash
# Run the list command to see which provider is active
clawvault list

# Or check audit log
tail ~/.clawvault/audit.log
```

## Cross-Platform Development

For development across platforms:

### Docker Containers

```dockerfile
# Install libsecret-tools in your Dockerfile
RUN apt-get update && apt-get install -y libsecret-tools
```

### CI/CD

```yaml
# GitHub Actions example
- name: Install dependencies
  run: sudo apt-get install -y libsecret-tools

- name: Run tests
  run: npm test
```

### WSL (Windows Subsystem for Linux)

WSL uses the Linux provider:
```bash
# Install libsecret-tools in WSL
sudo apt-get install libsecret-tools

# Note: GNOME Keyring daemon needs to be running in WSL
```

## Platform-Specific Bugs

### Linux

- **Keyring locked at boot**: Services starting before user login may not have keyring access. Consider using systemd user services.

### macOS

- **Duplicate item error**: When re-adding an existing secret, macOS returns a duplicate error. ClawVault handles this by deleting and re-adding.

### Windows

- **PowerShell parsing**: The `get()` method relies on parsing `cmdkey /list` output, which may vary by Windows version.

## Getting Help

If you encounter platform-specific issues:

1. Check this document's troubleshooting section
2. Run `clawvault list` to verify platform detection
3. Check `~/.clawvault/audit.log` for error details
4. File an issue on GitHub with your platform and error details
