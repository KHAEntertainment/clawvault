<coding_guidelines>
# Agents Guide (ClawVault)

This repo is a security-sensitive secret manager. The primary invariant is
**secret values must never enter AI-visible context** (logs, errors, test
output, HTTP responses, CLI output).

## Commands

```bash
npm install           # Install dependencies
npm run build         # TypeScript compilation
npm test              # Run all test suites
npm run lint          # ESLint checks
npm run audit:security  # npm audit at high severity
```

## Repo layout

- `src/` — implementation
  - `src/storage/` platform keyring providers + audit wrapper
  - `src/config/` config schemas + loader/saver (definitions only)
  - `src/gateway/` environment injection + service integration
  - `src/web/` Express UI for submission/status (metadata only, auth-gated)
  - `src/cli/` Commander/Inquirer CLI
- `test/` — `unit/`, `integration/`, `security/`
- `docs/` — all non-README documentation
  - `docs/agent/` agent notes/prompts
  - `docs/planning/` design/brief/implementation plan
  - `docs/reference/` upstream references and scripts
  - `docs/SECURITY.md` — **full threat model, security controls, and
    troubleshooting guide** (read this first when debugging security issues)

Keep the repo root minimal (code/config + `README.md` + this file). Put new
notes/specs under `docs/`.

## TypeScript / module conventions

- This package is **ESM** (`"type": "module"`) with TS `NodeNext` resolution.
- Follow the existing import style: internal relative imports include the
  compiled extension (e.g. `./commands/add.js`).
- Keep `strict` typing; avoid `any`.

## Security rules (non-negotiable)

1. **Never log secret values** (even in debug).
2. **Never return secret values** from any API that can reach users/agents
   (CLI output, HTTP responses, thrown errors).
3. Validate and/or strictly allowlist identifiers used in shell/system
   integration (secret names, env var names, service names).
   Pattern: `^[A-Z][A-Z0-9_]*$`
4. **Always use `execFile`/`spawn` with argument arrays** for any OS command
   execution. Never use `exec()` or shell command strings. Never use `npx`.
5. Update/add tests under `test/security/` when changing surfaces that could
   leak.
6. The web server requires a **bearer token** for all API routes. CORS is
   locked to the server's own origin. Rate limiting applies to `/api/submit`.

## Security architecture (embedded reference)

ClawVault's full security model is documented in `docs/SECURITY.md`. Key
points for agents:

### Command execution
All OS commands (`secret-tool`, `security`, `cmdkey`, `powershell`) are called
via `execFile()` with argument arrays. This prevents shell injection even if a
secret value contains metacharacters like `$(...)`, backticks, or pipes.

### Web server hardening
- **Auth:** One-time bearer token generated at startup, printed to terminal.
- **CORS:** Locked to own origin (prevents browser-based cross-origin attacks).
- **Rate limit:** 30 req/15min on `/api/submit`.
- **Helmet:** CSP, HSTS (TLS), X-Content-Type-Options, Referrer-Policy.
- **Binding:** Localhost default. Non-localhost triggers a warning.

### No secret retrieval endpoint
There is intentionally no HTTP endpoint to retrieve secret values. The
`/api/status` route returns names only. The `StorageProvider.get()` method is
marked INTERNAL USE ONLY and must never be exposed in any public surface.

### Audit logging
`AuditedStorageProvider` wraps any provider with structured JSON event logging.
Events contain operation name, secret name, success flag, and error message.
Never secret values.

### Fallback encryption
When no native keyring is available, AES-256-GCM encryption with
machine-id-based key derivation is used. This is weaker than a real keyring —
users see a warning.

## Troubleshooting (quick reference)

| Symptom | Cause | Fix |
|---------|-------|-----|
| 401 Unauthorized | Missing/wrong bearer token | Use the token printed at server startup |
| CORS error | Wrong origin | Access via the exact URL printed at startup |
| 429 Too Many Requests | Rate limit hit | Wait 15min or restart server |
| Invalid secret name | Name doesn't match pattern | Use `^[A-Z][A-Z0-9_]*$` |
| Fallback storage warning | No keyring tools | Install platform tools (see docs/SECURITY.md) |
| Non-localhost warning | `--host` set to non-localhost | Only on trusted networks; use TLS |

For the full troubleshooting guide, see `docs/SECURITY.md`.

## When changing storage/gateway/web

- Re-run: `npm run build && npm test && npm run lint`.
- Pay attention to `test/security/context-leak.test.ts` and keep it passing.
- If adding a new command or endpoint, add a context-leak test for it.
</coding_guidelines>
