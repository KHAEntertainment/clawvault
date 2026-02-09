# ClawVault Security Model

This document describes ClawVault's security architecture, threat model, and
troubleshooting guidance. It is intended for both human developers and AI agents
that operate on or integrate with ClawVault.

---

## Core Invariant

**Secret values must never enter AI-visible context.**

This means secret values must never appear in:
- Error messages, thrown exceptions, or rejection reasons
- CLI stdout/stderr output
- HTTP response bodies
- Log output (console.log, console.error, console.warn)
- Test output or assertion messages
- Configuration files or environment variable definitions visible to agents

## Threat Model

### Threat 1: Command Injection via Shell Interpolation

**Risk:** If secret values or names are interpolated into shell command strings,
an attacker who controls a secret value could execute arbitrary commands.

**Mitigation:**
- All storage providers use `execFile()` with argument arrays, not `exec()`.
- `execFile` bypasses the shell entirely -- arguments are passed as C-level argv
  entries, so metacharacters like `$()`, backticks, pipes, and semicolons have
  no special meaning.
- Secret names are validated against `/^[A-Z][A-Z0-9_]*$/` before any command
  is constructed. This prevents injection via crafted names.

**Verification:** The tests in `test/unit/storage/` verify that dangerous
characters in secret values pass through safely. The context-leak tests in
`test/security/` scan source files for patterns that could leak values.

### Threat 2: Supply Chain Attacks (npx, arbitrary code execution)

**Risk:** The "confidant" plugin executes `npx @aiconnect/confidant`, which
downloads and runs arbitrary code from npm at runtime. A compromised package
could exfiltrate secrets.

**Mitigation:**
- ClawVault **never** uses `npx`, `npm exec`, or any runtime code download.
- All external commands are OS-provided binaries with known paths:
  - Linux: `secret-tool`, `gdbus`, `systemctl`
  - macOS: `security`
  - Windows: `cmdkey`, `powershell`
- Dependencies are locked in `package-lock.json`. Use `npm ci` (not `npm install`)
  in CI to ensure reproducible builds.
- Run `npm run audit:security` to check for known vulnerabilities.

### Threat 3: Network Exposure of Secret Submission Endpoint

**Risk:** The web UI starts an HTTP server that accepts secret submissions. If
exposed to the network (via tunneling, binding to 0.0.0.0, or port forwarding),
any network attacker could submit or enumerate secrets.

**Mitigation:**
- Server binds to `localhost` (127.0.0.1) by default.
- Binding to any non-localhost address triggers a prominent security warning.
- **Bearer token authentication**: A cryptographically random 64-character token
  is generated at startup and printed to the terminal. All API requests require
  `Authorization: Bearer <token>`.
- **Rate limiting**: `/api/submit` is limited to 30 requests per 15-minute window.
- **CORS**: Origin is locked to the server's own `scheme://host:port`. Cross-origin
  requests from malicious browser pages are blocked.
- **Helmet**: Comprehensive security headers (CSP, X-Frame-Options, X-Content-Type-Options,
  Referrer-Policy, etc.) are applied.
- **No secret retrieval endpoint**: There is intentionally no API to read secret
  values. Only metadata (names, counts) is returned.

### Threat 4: Local Process Attacks

**Risk:** Other processes running as the same user could access the keyring or
the web server's API.

**Mitigation:**
- Platform keyrings (macOS Keychain, GNOME Keyring, Windows Credential Manager)
  are session-locked and require user authentication for access.
- The fallback encrypted file provider uses file permissions (mode 0600) and
  machine-specific key derivation to limit access.
- The web server's bearer token is only printed to the terminal; other local
  processes would need to read the terminal output to obtain it.

### Threat 5: Weak Key Derivation in Fallback Provider

**Risk:** The fallback provider (used when no keyring is available) derives its
encryption key from a machine identifier. If the machine-id is predictable
(e.g., in Docker containers), the key is weaker.

**Mitigation:**
- The fallback provider reads `/etc/machine-id` (Linux) as primary key material.
- A 32-byte random salt is generated on first use and stored in `~/.clawvault/.salt`
  with mode 0600.
- If no machine-id is available, a username-based fallback is used with an
  explicit warning.
- The fallback provider always emits a prominent warning encouraging users to
  install platform keyring tools.

---

## Architecture Reference

### Storage Providers

| Provider | Platform | Backend | Command | Injection-Safe |
|----------|----------|---------|---------|----------------|
| `LinuxKeyringProvider` | Linux | GNOME Keyring | `secret-tool`, `gdbus` | Yes (execFile) |
| `MacOSKeychainProvider` | macOS | Keychain | `security` | Yes (execFile) |
| `WindowsCredentialManager` | Windows | Credential Manager | `cmdkey`, `powershell` | Yes (execFile) |
| `FallbackProvider` | Any | Encrypted file | None (crypto only) | N/A |

### Web Server Middleware Stack

```
Request → Helmet → CORS → Body Parser → Auth (Bearer) → Rate Limiter → Route Handler
```

- `helmet`: Security headers (CSP, HSTS, X-Frame-Options, etc.)
- `cors`: Origin allowlist locked to server's own address
- `express.json`/`express.urlencoded`: Body parsing with 64KB limit
- Auth middleware: Validates `Authorization: Bearer <token>` header
- `express-rate-limit`: 30 requests per 15 minutes on `/api/submit`

### Audit System

`AuditedStorageProvider` wraps any `StorageProvider` and emits structured JSON
events for every operation. Events contain:

```json
{
  "timestamp": "2026-02-09T12:00:00.000Z",
  "operation": "set",
  "secretName": "OPENAI_API_KEY",
  "success": true
}
```

Events **never** contain secret values. Audit handler failures are caught and
silently ignored to prevent audit issues from blocking secret access.

---

## Troubleshooting Guide (For AI Agents)

### "Failed to store secret in macOS Keychain"
- The `security` CLI returned an error. Check that the user has keychain access.
- If the error is about a duplicate, the provider handles this automatically.
- If persistent, the user may need to unlock their keychain: `security unlock-keychain`.

### "Invalid secret name: ..."
- Secret names must match `/^[A-Z][A-Z0-9_]*$/`.
- Common mistakes: lowercase letters, hyphens, spaces, leading digits.
- Example valid names: `OPENAI_API_KEY`, `DB_PASSWORD`, `AWS_SECRET_KEY`.

### "Unauthorized: invalid or missing bearer token"
- The web server requires a bearer token for all API routes except `/health`.
- The token is printed to the terminal when the server starts.
- Include it as: `Authorization: Bearer <token>` in the request header.

### "Too many requests. Try again later."
- Rate limit hit on `/api/submit` (30 requests per 15-minute window).
- Wait 15 minutes or restart the server to reset the window.

### "CORS error" in browser
- The browser is making a cross-origin request from a different origin.
- The server only allows requests from its own origin (e.g., `http://localhost:3000`).
- Ensure the browser is accessing the same host:port the server is bound to.

### "WARNING: Using fallback encrypted file storage"
- No platform keyring tools detected. Install them:
  - Linux: `apt install libsecret-tools`
  - macOS: Built-in (should not see this on macOS)
  - Windows: Built-in (should not see this on Windows)

### "WARNING: Binding to a non-localhost address!"
- The user passed `--host` with an address other than localhost/127.0.0.1/::1.
- This exposes the secret submission endpoint to the network.
- Only appropriate on trusted, firewalled networks with TLS enabled.

### Secret stored but not appearing in gateway environment
- Check that the secret name in the config matches exactly (case-sensitive).
- Run `clawvault list` to verify the secret exists in the keyring.
- Check `systemctl --user show-environment` (Linux) to see injected vars.
- The gateway injection writes to the process environment and optionally to
  systemd user sessions.

### Build/test failures after modifying storage or web code
- Always run: `npm run build && npm test && npm run lint`
- Pay attention to `test/security/context-leak.test.ts` -- it scans source
  files for patterns that could leak secret values.
- Check that no `exec()` calls were introduced (only `execFile` is allowed).

---

## Security Checklist (For PRs)

- [ ] No `exec()` or `execSync()` calls with string interpolation of user/secret data
- [ ] All new external commands use `execFile()` with argument arrays
- [ ] Secret values never appear in error messages, logs, or HTTP responses
- [ ] Secret names validated against `/^[A-Z][A-Z0-9_]*$/` before use
- [ ] New CLI commands do not call `storage.get()` or expose retrieved values
- [ ] `test/security/context-leak.test.ts` still passes
- [ ] Web routes return metadata only (names, lengths, counts)
- [ ] No `npx`, `npm exec`, or runtime code download introduced
- [ ] Dependencies added to `package.json` are necessary and from trusted sources
