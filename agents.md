# Agents Guide (ClawVault)

This repo is a security-sensitive secret manager. The primary invariant is **secret values must never enter AI-visible context** (logs, errors, test output, HTTP responses, CLI output).

## Commands

```bash
npm install
npm run build
npm test
npm run lint
```

## Repo layout

- `src/` — implementation
  - `src/storage/` platform keyring providers + audit
  - `src/config/` config schemas + loader/saver (definitions only)
  - `src/gateway/` environment injection + service integration
  - `src/web/` Express UI for submission/status (metadata only)
  - `src/cli/` Commander/Inquirer CLI
- `test/` — `unit/`, `integration/`, `security/`
- `docs/` — all non-README documentation
  - `docs/agent/` agent notes/prompts
  - `docs/planning/` design/brief/implementation plan
  - `docs/reference/` upstream references and scripts

Keep the repo root minimal (code/config + `README.md` + this file). Put new notes/specs under `docs/`.

## TypeScript / module conventions

- This package is **ESM** (`"type": "module"`) with TS `NodeNext` resolution.
- Follow the existing import style: internal relative imports include the compiled extension (e.g. `./commands/add.js`).
- Keep `strict` typing; avoid `any`.

## Security rules (non-negotiable)

1. **Never log secret values** (even in debug).
2. **Never return secret values** from any API that can reach users/agents (CLI output, HTTP responses, thrown errors).
3. Validate and/or strictly allowlist identifiers used in shell/system integration (secret names, env var names, service names).
4. Prefer `execFile`/`spawn` with argument arrays over shell command strings for any OS command execution.
5. Update/add tests under `test/security/` when changing surfaces that could leak.

## When changing storage/gateway/web

- Re-run: `npm run build && npm test && npm run lint`.
- Pay attention to `test/security/context-leak.test.ts` and keep it passing.
