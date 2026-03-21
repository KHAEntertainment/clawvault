# Agents Guide (ClawVault)

ClawVault is a security-sensitive secret manager for OpenClaw. Secrets are stored in OS-native encrypted keyrings (GNOME Keyring, macOS Keychain, Windows Credential Manager).

**PRIMARY INVARIANT:** Secret values must never enter AI-visible context (logs, errors, test output, HTTP responses, CLI output).

## Build and Test Commands

```bash
npm install               # Install dependencies
npm run build            # Build TypeScript (output to dist/)
npm run dev              # Watch mode for development
npm test                 # Run all tests (unit, integration, security)
npx jest test/unit/      # Unit tests only
npx jest test/integration/   # Integration tests only
npx jest test/security/  # Security tests (CRITICAL - must pass)
npx jest test/unit/storage/linux.test.ts  # Single test file
npm test -- --coverage  # Run with coverage
npm test -- --watch     # Watch mode for tests
npm run lint            # Linting
npm run audit:security  # npm audit at high severity
```

### Pre-Commit Checklist

```bash
npm run build && npm test && npm run lint
```

Pay special attention to `test/security/context-leak.test.ts` - it must always pass.

## Code Style Guidelines

### TypeScript Conventions

- **Strict mode enabled** - No implicit any
- **Module:** ESM with NodeNext resolution
- **Target:** ES2022
- **File extensions:** Imports must include `.js` extension (e.g., `./commands/add.js`)
- **Use TSDoc** for function/class documentation with security notes

### Naming Conventions

| Type | Pattern | Example |
|------|---------|---------|
| Files | kebab-case | `linux-provider.ts` |
| Classes | PascalCase | `LinuxKeyringProvider` |
| Functions/Variables | camelCase | `createStorage` |
| Constants | UPPER_SNAKE_CASE | `SECRET_NAME_PATTERN` |
| Interfaces | PascalCase (no I prefix) | `StorageProvider` |

### Import Order

Node.js built-ins → External dependencies → Internal modules (with .js) → Relative imports (with .js)

### Error Handling

Use typed errors with proper inheritance. Example: `class StorageError extends Error { constructor(message: string, public readonly cause?: unknown) { super(message); this.name = 'StorageError' } }`

**CRITICAL:** Never include secret values in error messages, stack traces, or logs.

## Security Rules (NON-NEGOTIABLE)

### Command Injection Prevention

- **Always use `execFile()` with argument arrays** - Never use `exec()` or shell strings
- Secret names validated against: `/^[A-Z][A-Z0-9_]*$/`
- Arguments passed as C-level argv, bypassing shell interpolation

### Context Leak Prevention

**Secret values must never appear in:**
- Error messages or thrown exceptions
- CLI stdout/stderr output
- HTTP response bodies
- Log output (console.log, console.error)
- Test output or assertion messages
- Source code patterns (e.g., `console.log(secret)`)

### Web Server Security

- Binding: Localhost (127.0.0.1) by default
- Auth: Cryptographically random 64-char bearer token
- Rate Limit: 30 requests per 15-min window on `/api/submit`
- No retrieval endpoint: Intentionally no API to read secret values
- Helmet: CSP, HSTS, X-Content-Type-Options, Referrer-Policy

### Storage Provider Security

All providers MUST use `execFile()` with argument arrays only:
- LinuxKeyringProvider: `secret-tool`, `gdbus`
- MacOSKeychainProvider: `security`
- WindowsCredentialManager: `cmdkey`, `powershell`
- FallbackProvider: Node.js crypto (N/A)

### Supply Chain Security

- **Never use `npx`, `npm exec`, or runtime code download**
- All external commands are OS-provided binaries with known paths
- Dependencies locked in `package-lock.json`

## Testing Strategy

| Directory | Purpose |
|-----------|---------|
| `test/unit/` | Isolated unit tests for each module |
| `test/integration/` | End-to-end flows and integration |
| `test/security/` | **CRITICAL:** Context leak prevention |

### Security Test Requirements

When modifying storage, gateway, or CLI code: Verify `test/security/context-leak.test.ts` passes, add tests for new commands/endpoints, ensure no `storage.get()` calls in CLI (except `resolve.ts`), verify no `exec()` usage (only `execFile` with argument arrays).

## Technology Stack

### Runtime Dependencies
express (4.x), commander (11.x), inquirer (9.x), chalk (5.x), helmet (8.x), cors (2.x), express-rate-limit (8.x)

### Dev Dependencies
typescript (5.2+), jest (29.x) + ts-jest, eslint (8.x) + @typescript-eslint

## Repository Layout

src/cli - Commander/Inquirer CLI
src/config - Configuration schemas and loader
src/gateway - Environment injection + service management
src/openclaw - OpenClaw migration utilities
src/storage - Platform keyring providers + implementations
src/types - Shared TypeScript types
src/web - Express Web UI
test/unit - Unit tests (mirror src structure)
test/integration - Integration tests
test/security - CRITICAL: Context leak prevention tests
docs - Documentation

## Additional Documentation

- `docs/SECURITY.md` - Full threat model and security controls
- `docs/ARCHITECTURE.md` - System design and data flow
- `docs/CLI.md` - Complete CLI reference

**Remember:** When in doubt, prioritize security over convenience. Secret values must never be exposed to AI context.
