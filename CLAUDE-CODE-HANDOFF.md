# ClawVault - Claude Code Handoff Prompt

**Copy and paste this prompt directly into Claude Code:**

---

You are now the primary developer for ClawVault - a secure secret management system for OpenClaw.

## Project Context

ClawVault combines the best of Confidant (web UI UX) and Secret Manager (keyring security), while fixing their critical weaknesses. The core security guarantee is that secrets NEVER enter AI context.

## What's Already Done

✅ **Project Setup Complete**
- Git repository initialized at `/home/openclaw/.openclaw/workspace/projects/clawvault`
- DESIGN.md with full system architecture (read this first!)
- PROJECT_BRIEF.md with requirements and success criteria
- CLAUDE.md with project guidance
- Reference docs for Confidant and Secret Manager
- Dependencies installed (npm install completed - 527 packages)
- Directory structure created
- TypeScript configured

✅ **Analysis Complete**
- Confidant: Good UX, but security theater (secrets pass through AI)
- Secret Manager: Good security model, but hardcoded keys, Linux-only
- ClawVault: Best of both + dynamic config + cross-platform

## Your Mission

Implement ClawVault following the DESIGN.md implementation phases.

### Phase 1: Core Storage (Days 1-2)
**Status:** Not started

**Tasks:**
1. Read `DESIGN.md` → Section 11 (Implementation Phases)
2. Create TypeScript type definitions (`src/types/index.ts`)
3. Define storage interface (`src/storage/interfaces.ts`)
4. Implement platform detection
5. Implement Linux keyring provider (`src/storage/providers/linux.ts`)
   - Use `secret-tool` command
   - Implement: `set(name, value)`, `get(name)`, `delete(name)`, `list()`
   - Follow keyring schema from DESIGN.md
6. Implement storage factory (`src/storage/index.ts`)
7. Write unit tests (`test/unit/storage/`)
   - Test all CRUD operations
   - Test error handling
   - Test platform detection
8. **Security test:** Verify no AI context leakage (`test/security/context-leak.ts`)
   - Ensure `get()` never returns values in API surface
   - Ensure errors log metadata only, never values
   - Ensure audit logs don't contain secret values

**Success Criteria:**
- All storage providers compile (tsc passes)
- Unit tests pass (npm test)
- Security tests verify no value leakage
- Can store/retrieve/delete/list secrets via Linux keyring

### Phase 2: Configuration System (Days 2-3)
**Status:** Not started

**Tasks:**
1. Create config schema validator (`src/config/schemas.ts`)
2. Implement config loader (`src/config/index.ts`)
3. Create default secrets template (`src/config/defaults.ts`)
4. Implement secret template system
5. Write config validation tests
6. **Security test:** Config never logs secret values

**Success Criteria:**
- Can load config from `~/.config/clawvault/secrets.json`
- Validates all fields
- Supports dynamic secret definitions
- Templates work correctly

### Phase 3: Gateway Integration (Days 3-4)
**Status:** Not started

**Tasks:**
1. Implement environment injection (`src/gateway/environment.ts`)
2. Implement systemd service manager (`src/gateway/systemd.ts`)
3. Create gateway integration entry point (`src/gateway/index.ts`)
4. Write integration tests
5. **Security test:** Secrets only injected into gateway environment, never logged

**Success Criteria:**
- Can inject secrets into OpenClaw Gateway environment
- Can restart gateway service
- Integration tests pass
- Secrets never appear in logs

### Phase 4: Web UI (Days 4-5)
**Status:** Not started

**Tasks:**
1. Create Express server (`src/web/index.ts`)
2. Implement secret submission route (`src/web/routes/submit.ts`)
3. Implement status route (`src/web/routes/status.ts`)
4. Create HTML form template (`src/web/routes/templates/form.html`)
5. Add TLS support
6. Write web UI tests
7. **Security test:** Web server validates inputs, uses HTTPS when enabled

**Success Criteria:**
- Web server starts on configurable port
- Form submits secrets directly to keyring (bypassing AI)
- HTTPS works when enabled
- Security tests pass

### Phase 5: CLI Tool (Days 5-6)
**Status:** Not started

**Tasks:**
1. Create CLI entry point (`src/cli/index.ts`)
2. Implement `add` command (`src/cli/commands/add.ts`)
3. Implement `list` command (`src/cli/commands/list.ts`)
4. Implement `remove` command (`src/cli/commands/remove.ts`)
5. Implement `rotate` command (`src/cli/commands/rotate.ts`)
6. Implement `serve` command (`src/cli/commands/serve.ts`)
7. Add interactive prompts (inquirer.js)
8. Write CLI tests
9. **Security test:** CLI never exposes secret values in errors/help

**Success Criteria:**
- All commands work
- Interactive prompts work
- CLI tests pass
- Security tests pass

### Phase 6: Cross-Platform (Days 6-7)
**Status:** Not started

**Tasks:**
1. Implement macOS Keychain provider (`src/storage/providers/macos.ts`)
   - Use `security` command
2. Implement Windows Credential Manager provider (`src/storage/providers/windows.ts`)
   - Use `cmdkey` command
3. Implement fallback storage (`src/storage/providers/fallback.ts`)
   - Encrypted JSON file for development
   - Emit prominent warning
4. Write cross-platform tests
5. Update platform detection logic
6. **Security test:** All platforms encrypt secrets at rest

**Success Criteria:**
- Works on macOS (Keychain)
- Works on Windows (Credential Manager)
- Fallback storage works with warning
- Cross-platform tests pass

### Phase 7: Polish & Docs (Days 7-8)
**Status:** Not started

**Tasks:**
1. Security audit review
2. Complete documentation:
   - docs/SECURITY.md
   - docs/ARCHITECTURE.md
   - docs/API.md
   - docs/CONFIGURATION.md
   - docs/PLATFORMS.md
   - docs/CONTRIBUTING.md
   - docs/RELEASE.md
3. Create OpenClaw skill (`.clawhub/SKILL.md`)
4. Integration tests (end-to-end workflows)
5. Final security verification
6. Package for npm
7. Prepare for ClawHub publication

**Success Criteria:**
- All docs complete
- Security audit passed
- Integration tests pass
- Skill manifest complete
- Ready for ClawHub publication

## Critical Security Rules

1. **NEVER expose secret values in AI context**
   - API methods return metadata only
   - Internal `get()` only used for gateway injection
   - Errors log metadata, never values

2. **NEVER write secrets to config files**
   - Store only in OS keyring
   - Config files contain definitions, not values

3. **ALWAYS validate inputs**
   - Secret name format
   - Secret value length
   - Required fields

4. **ALWAYS use encrypted storage**
   - Platform-native keyring
   - No plaintext secrets anywhere

5. **ALWAYS document security guarantees and limitations**
   - Honest disclosure of what's protected vs what's not
   - Clear warnings for limitations

## Development Commands

```bash
# Build TypeScript
npm run build

# Watch mode for development
npm run dev

# Run tests
npm test

# Run specific test
npx jest test/unit/storage/linux.test.ts

# Lint code
npm run lint

# Run CLI locally
node dist/cli.js

# Check TypeScript compilation
npx tsc --noEmit
```

## Work Autonomously

- Work through phases sequentially (Phase 1 → Phase 2 → ... → Phase 7)
- Within each phase, complete all tasks before moving to next
- If you hit a blocker or need clarification, STOP and notify Billy
- When a phase is complete, commit your changes with clear message
- Before moving to next phase, run tests to verify everything works

## Notification

When **each phase** is complete, update Billy:
```
ClawVault Phase [N] Complete: [brief summary of what was built]

Tests: [pass/fail]
Commits: [number]
Next: Ready for Phase [N+1]
```

When the **entire project** is complete, notify Billy:
```
ClawVault Implementation Complete! 🎉

All 7 phases finished
All tests passing
Documentation complete
Ready for ClawHub publication

Files created: [number]
Test coverage: [percentage]
Ready for testing and review.
```

## Files to Reference

- **DESIGN.md** - Complete system design (read first!)
- **PROJECT_BRIEF.md** - Requirements and success criteria
- **CLAUDE.md** - Project guidance for you
- **reference-secret-manager.md** - Secret Manager analysis
- **reference-secret-manager.sh** - Secret Manager script (bash)
- **reference-confidant.md** - Confidant analysis
- **tsconfig.json** - TypeScript configuration
- **package.json** - Dependencies and scripts

## Git Workflow

- Work in feature branches if needed
- Commit frequently with clear messages
- Example commits:
  - "Phase 1: Implement storage interface and Linux keyring provider"
  - "Phase 1: Add unit tests for storage layer"
  - "Phase 1: Security tests verify no AI context leakage"
  - "Phase 2: Implement config system with validation"
- Push to remote when complete

## Success Criteria (From DESIGN.md)

- ✅ Secrets NEVER enter AI context (verified via security tests)
- ✅ Platform-agnostic keyring support (Linux, macOS, Windows)
- ✅ Dynamic secret definitions (no hardcoded limits)
- ✅ Comprehensive test coverage (90%+)
- ✅ Clear documentation of security guarantees and limitations
- ✅ Published to ClawHub with working examples
- ✅ Production-ready for single-user scenarios

---

**Begin with Phase 1: Core Storage implementation now.**

Good luck! 🦀
