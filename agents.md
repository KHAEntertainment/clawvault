# Agents Guide (ClawVault)

This repo is a security-sensitive secret manager. The primary invariant is
**secret values must never enter AI-visible context** (logs, errors, test
output, HTTP responses, CLI output).

---

## Build and Test Commands

```bash
# Install dependencies
npm install

# Build TypeScript (output to dist/)
npm run build

# Watch mode for development
npm run dev

# Run all tests (unit, integration, security)
npm test

# Run specific test suites
npx jest test/unit/           # Unit tests only
npx jest test/integration/    # Integration tests only
npx jest test/security/       # Security tests (CRITICAL - must pass)

# Run single test file
npx jest test/unit/storage/linux.test.ts

# Run with coverage
npm test -- --coverage

# Watch mode for tests
npm test -- --watch

# Linting
npm run lint

# Security audit
npm run audit:security        # npm audit at high severity
```

### Pre-Commit Checklist

```bash
npm run build && npm test && npm run lint
```

Pay special attention to `test/security/context-leak.test.ts` - it must always pass.

---

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

```typescript
// 1. Node.js built-ins
import { promises as fs } from 'fs'
import { join } from 'path'

// 2. External dependencies
import express from 'express'
import chalk from 'chalk'

// 3. Internal modules (with .js extension)
import { createStorage } from '../storage/index.js'
import { loadConfig } from '../config/index.js'

// 4. Relative imports (with .js extension)
import { validateName } from './validation.js'
```

### Error Handling

Use typed errors with proper inheritance:

```typescript
export class StorageError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message)
    this.name = 'StorageError'
  }
}
```

**CRITICAL:** Never include secret values in error messages, stack traces, or logs.

---

## Security Rules (NON-NEGOTIABLE)

### Command Injection Prevention

- **Always use `execFile()` with argument arrays** - Never use `exec()` or shell command strings
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

---

## Testing Strategy

| Directory | Purpose |
|-----------|---------|
| `test/unit/` | Isolated unit tests for each module |
| `test/integration/` | End-to-end flows and integration |
| `test/security/` | **CRITICAL:** Context leak prevention |

### Security Test Requirements

When modifying storage, gateway, or CLI code:

1. Verify `test/security/context-leak.test.ts` still passes
2. Add tests for any new commands/endpoints
3. Ensure no `storage.get()` calls in CLI commands (except `resolve.ts`)
4. Verify no `exec()` usage (only `execFile` with argument arrays)

---

## Technology Stack

### Runtime Dependencies
express (4.x), commander (11.x), inquirer (9.x), chalk (5.x), helmet (8.x), cors (2.x), express-rate-limit (8.x)

### Dev Dependencies
typescript (5.2+), jest (29.x) + ts-jest, eslint (8.x) + @typescript-eslint

---

## Repository Layout

```
clawvault/
├── src/
│   ├── cli/         # Commander/Inquirer CLI
│   ├── config/      # Configuration schemas and loader
│   ├── gateway/     # Environment injection + service management
│   ├── openclaw/    # OpenClaw migration utilities
│   ├── storage/     # Platform keyring providers + implementations
│   ├── types/       # Shared TypeScript types
│   └── web/         # Express Web UI
├── test/
│   ├── unit/        # Unit tests (mirror src structure)
│   ├── integration/ # Integration tests
│   └── security/    # CRITICAL: Context leak prevention tests
└── docs/            # Documentation
```

---

## Additional Documentation

- `docs/SECURITY.md` - Full threat model and security controls
- `docs/ARCHITECTURE.md` - System design and data flow
- `docs/CLI.md` - Complete CLI reference

---

## NPM Package Instructions

When releasing a new version of ClawVault, agents must:

1. Update the version number in package.json
2. Run full build and test suite:
   ```bash
   npm install
   npm run build
   npm test
   ```
3. Create a git tag for the release:
   ```bash
   git tag v0.2.1  # Example for next version
   ```
4. Push the tag to trigger GitHub Actions workflow:
   ```bash
   git push origin v0.2.1
   ```
5. Verify the package was published successfully at:
   ```
   https://www.npmjs.com/package/@khaentertainment/clawvault
   ```
6. Update AGENTS.md and CLAUDE.md with any relevant version-specific notes

**Note**: The GitHub Actions workflow `.github/workflows/npm-publish.yml` handles automatic publishing when version tags are pushed. Ensure the `NPM_TOKEN` secret is configured in the repository settings.

---

**Remember:** When in doubt, prioritize security over convenience. Secret values must never be exposed to AI context.
