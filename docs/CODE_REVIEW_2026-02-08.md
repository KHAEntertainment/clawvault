# ClawVault Code Review (2026-02-08)

## Scope
Review focused on:
- code quality and reliability,
- security hardening,
- implementation completeness (no simulated or hallucinated behavior).

Checks performed:
- `npm run build`
- `npm test`
- `npm run lint`

## Executive Summary
- Build compiles successfully.
- Test suite has multiple deterministic failures (unit + security + e2e), indicating quality and completion gaps.
- One CLI path appears to simulate a missing module state even when runtime failures could have other causes.
- Multiple shell command callsites interpolate untrusted values directly into command strings (potential command-injection risk).
- Error responses include raw exception text in at least one web API path, which can leak internals.

## Findings

### 1) Linux provider parsing bug breaks retrieval/list/exists behaviors (High)
`LinuxKeyringProvider.parseGdbusOutput()` uses a regex requiring a space between `<` and `'` (`/< '([^']+)'/`) that does not match common `gdbus` output style (`<'NAME'>`). This likely explains failing unit tests around `list()` and downstream `has()` behavior.

Evidence:
- Regex pattern: `src/storage/providers/linux.ts`.
- Failing tests observed in `test/unit/storage/linux.test.ts` via `npm test`.

Recommendation:
- Make parser robust to optional whitespace (`<\s*'...'`) and add fixture-based parser tests.

### 2) Potential command injection via interpolated secret names/service args (High)
Several command invocations embed variables directly in shell commands without strict validation/escaping:
- Linux provider: `name` is interpolated into `secret-tool ... key "${name}"` and delete/get/list command paths.
- Systemd manager: service names and environment variable names are joined directly into `systemctl` command strings.

Even if CLI input currently validates many names, these classes are reusable and should defend in depth.

Recommendation:
- Prefer `spawn/execFile` with argument arrays over `exec` command strings.
- If shell is unavoidable, centralize strict allowlist validation for secret/env/service identifiers.

### 3) `serve` command has a broad catch that can present misleading “module not found” messaging (Medium)
`src/cli/commands/serve.ts` wraps dynamic import and server startup in an inner `try/catch` that catches **all** errors and prints Phase-4/module-not-found guidance. Since `src/web/index.ts` exists, runtime startup errors (binding failure, TLS file errors, etc.) could be misreported as missing module, creating a simulated/inaccurate result path.

Recommendation:
- Catch only module-resolution errors (`ERR_MODULE_NOT_FOUND`) for fallback messaging.
- Re-throw startup/runtime failures so users receive accurate diagnostics.

### 4) Web submit route returns raw error message to clients (Medium)
`submitSecret()` returns `message: errorMessage` on 500s. Provider-level errors can include command context and internals; returning raw messages risks information leakage.

Recommendation:
- Return generic client-safe message; log detailed errors only to secure server logs (with secret redaction).

### 5) Test/lint pipeline not currently “green” (High)
- `npm test` fails across storage/security/e2e suites.
- `npm run lint` fails because ESLint config is missing.

This is a project-completion and quality-gate issue.

Recommendation:
- Add and enforce ESLint config.
- Split environment-dependent integration/e2e tests from default unit test command or use robust mocks/feature flags.

## Completion / “Real vs Simulated” Assessment
- Most core modules are implemented and callable (build succeeds), but reliability is incomplete due to failing tests.
- The `serve` fallback path can produce an inaccurate “web module missing” result for non-import failures, which should be tightened to avoid simulated/misleading behavior.

## Suggested Priority Order
1. Fix Linux provider parsing + associated tests.
2. Harden command execution (move to `execFile/spawn` + strict validation).
3. Correct `serve` error handling granularity.
4. Sanitize outward-facing API error bodies.
5. Restore CI quality gates (lint config + stable test matrix).
