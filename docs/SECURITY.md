# ClawVault Security Model

## Overview

ClawVault is designed with a security-first approach to secret management. The core principle is that **secret values NEVER enter AI context** - they are stored in OS-native encrypted keyrings and injected directly into the OpenClaw Gateway process environment.

## What We Protect

### At-Rest Encryption
Secrets are stored encrypted using platform-native keyrings:

- **Linux**: GNOME Keyring / libsecret (encrypted with user login password)
- **macOS**: Keychain Services (encrypted with hardware Secure Enclave when available)
- **Windows**: Credential Manager (encrypted with DPAPI - tied to user credentials)

### AI Context Isolation
The primary security guarantee of ClawVault is that secret values bypass AI model context entirely:

1. **CLI**: Uses hidden input (`inquirer` password type) - secrets never visible in terminal
2. **Web UI**: Submits directly to keyring - responses contain only metadata (name, length)
3. **API**: `get()` method returns values only for internal gateway injection
4. **Logs**: Audit logs contain metadata only (action, secret name, timestamp, success/failure)

### Config File Safety
The configuration file (`~/.config/clawvault/secrets.json`) contains only:
- Secret definitions (metadata)
- Validation patterns
- Gateway service names

**Never** actual secret values.

### Shell History Protection
CLI commands use interactive prompts with hidden input, preventing secrets from appearing in:
- Shell history (`.bash_history`, `.zhistory`)
- Process listings (`ps aux`)
- Terminal scrollback

## What We Don't Protect

### Gateway Process Memory
Once secrets are injected into the OpenClaw Gateway environment, they can be exposed via:
- Process memory inspection (`/proc/*/environ`, `gdb`)
- Core dumps
- Process debugging tools

**Mitigation**: Limit gateway process debugging access. Use filesystem permissions on audit logs.

### Network Transmission
The Web UI defaults to HTTP (localhost only). Without TLS:
- Secrets can be intercepted on the network
- Man-in-the-middle attacks are possible

**Mitigation**: Always use `--tls` flag when exposing web UI beyond localhost. Run web UI on `localhost` only for development.

### Fallback Storage
When platform keyring tools are unavailable, ClawVault falls back to encrypted file storage:
- File: `~/.clawvault/secrets.enc.json`
- Encryption: AES-256-GCM with scrypt-derived key
- Weaker than platform keyring (depends on file permissions)

**Mitigation**: Install platform keyring tools for production use. Fallback emits a prominent warning.

### System-Level Access
An attacker with root/admin access can:
- Access keyring directly (if user is logged in)
- Read encrypted files and derive encryption keys
- Attach debugger to gateway process

**Mitigation**: ClawVault assumes a trusted system. It protects against accidental exposure and AI context leakage, not determined attackers with system access.

## Threat Model

### Protected Against

| Threat | Protection Mechanism |
|--------|---------------------|
| Secret values in AI logs | Secrets never passed to AI; only metadata exchanged |
| Secret values in config files | Values stored only in encrypted keyring |
| Shell history leakage | Interactive hidden input for all secret entry |
| Log aggregation capturing secrets | Audit logging records metadata only |
| Accidental terminal exposure | Password masking in CLI prompts |
| Debug output containing secrets | Error messages never include secret values |

### Not Protected Against

| Threat | Limitation |
|--------|------------|
| Root user accessing keyring | Platform keyrings accessible to authenticated user |
| Memory dump of gateway process | Secrets exist in process environment during runtime |
| Network sniffing without TLS | Web UI defaults to HTTP; use `--tls` for HTTPS |
| Physical machine access | Attacker with physical access can extract secrets |
| Compromised gateway code | Malicious gateway code could exfiltrate secrets |

## Security Best Practices

### For Users

1. **Always use TLS in production**: Enable `--tls` when running web UI on network-accessible interfaces
2. **Limit web UI binding**: Use `--host localhost` unless network access is required
3. **Protect audit logs**: `~/.clawvault/audit.log` contains access metadata; restrict file permissions
4. **Rotate secrets regularly**: Use `clawvault rotate` to update secret values
5. **Review secret definitions**: Periodically audit `~/.config/clawvault/secrets.json`

### For Developers

1. **Never log secret values**: Use audit logging for metadata only
2. **Never return `get()` results** to public APIs: Internal use only for gateway injection
3. **Validate all inputs**: Prevent command injection in keyring operations
4. **Use hidden input**: All CLI secret entry must use password-type prompts
5. **Test for leaks**: Run `test/security/context-leak.test.ts` before committing

## Security Audit

Run the security audit to verify no secret value leakage:

```bash
# Ensure no secret values in logs
grep -r "console.log.*value" src/
grep -r "console.log.*secret" src/

# Ensure get() not exported in public API
grep -r "export.*get" src/

# Ensure no hardcoded secrets
grep -r "sk-" src/
grep -r "Bearer" src/

# Run security tests
npm test test/security/
```

## Responsible Disclosure

If you discover a security vulnerability in ClawVault:

1. **Do not create a public issue**
2. Email details to: security@openclaw.dev
3. Include: description, steps to reproduce, potential impact
4. Allow 90 days for fix before public disclosure

## License

ClawVault is licensed under MIT. See LICENSE file for details.
