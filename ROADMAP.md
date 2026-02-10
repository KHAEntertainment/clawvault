# ClawVault Roadmap

## Current Status (v0.1.0)

### ✅ Completed
- **One-time secret request links** (`clawvault request`) — Confidant-style UX
- **Network security policy** — Tailscale-aware, TLS enforcement
- **Cross-platform storage** — systemd-creds, Secret Service, Keychain, Credential Manager
- **Migration system** — OpenClaw auth-profiles.json migration with backup/restore
- **CLI** — Full command suite (add, list, remove, rotate, serve, request, migrate, restore)
- **Documentation** — README, SECRET-REQUESTS, MIGRATION, CLI guides

### ⚠️ Known Limitation: OpenClaw auth-profiles.json

**The Issue:**
OpenClaw's `auth-profiles.json` does **not** support environment variable substitution. The file is loaded via raw `JSON.parse()` without `${VAR}` resolution.

**Impact:**
- OAuth tokens cannot use placeholders (breaks JWT parsing)
- API keys may work with placeholders but untested
- Migration to `${ENV_VAR}` format breaks OpenClaw authentication

**Current Workaround:**
Plaintext credentials with filesystem permissions (0600) — acceptable for single-user deployments.

**Upstream Issue:**
- GitHub: https://github.com/openclaw/openclaw/issues (to be created)
- Feature request: Add ENV substitution to auth-profiles.json

---

## Short-Term (Next 2-4 Weeks)

### 1. NPM Publication
- [ ] Publish `clawvault` to npm registry
- [ ] Verify global install: `npm install -g clawvault`
- [ ] Add installation instructions to README

### 2. ClawHub Skill
- [ ] Finalize skill documentation
- [ ] Add screenshots to docs
- [ ] Publish to ClawHub once NPM package is live

### 3. Monitor Upstream Issue
- [ ] Create GitHub issue for ENV substitution in auth-profiles.json
- [ ] Monitor for maintainer response
- [ ] If no response in 2-3 weeks, proceed to encryption alternative

### 4. Bug Fixes
- [ ] Mobile browser caching UX improvements
- [ ] Test API-key-only migration (without OAuth)

---

## Medium-Term (2-3 Months)

### Conditional: If Upstream Issue Accepted
- [ ] Wait for OpenClaw PR merge
- [ ] Test full migration with ENV substitution
- [ ] Update migration docs

### Conditional: If Upstream Issue Stalled
- [ ] Implement eCryptfs solution for at-rest encryption
- [ ] Document eCryptfs setup for production deployments
- [ ] Provide systemd units for mount/unmount lifecycle

### eCryptfs Plan (Tentative)

**Trigger:** No meaningful upstream response in 2-3 weeks

**Implementation:**
- Encrypt `~/.openclaw` directory with eCryptfs
- Transparent to OpenClaw (no code changes needed)
- Unlock at user login, lock at logout
- Single-Pi-friendly (no complex mount orchestration)

**Advantages over gocryptfs:**
- Simpler mount semantics (per-user, not per-service)
- No systemd unit complexity
- Native kernel support (better performance)
- Easier recovery if issues occur

---

## Long-Term (3+ Months)

### Advanced Features
- [ ] Audit logging for compliance
- [ ] Secret rotation reminders/notifications
- [ ] Team/shared secret workflows (multi-user)
- [ ] Hardware security module (HSM) support
- [ ] Cloud KMS integration (AWS KMS, GCP KMS, Azure Key Vault)

### Integrations
- [ ] OpenClaw plugin for native secret resolution
- [ ] Docker secrets support
- [ ] Kubernetes secrets operator
- [ ] CI/CD pipeline integrations

---

## Decision Log

### 2026-02-09: Migration Rollback
**Decision:** Restored plaintext auth-profiles.json after OAuth auth failure  
**Reason:** OpenClaw doesn't support ENV substitution in auth profiles  
**Next:** Monitor upstream issue, consider eCryptfs if stalled

### 2026-02-09: gocryptfs vs eCryptfs
**Decision:** eCryptfs as tentative plan, not immediate implementation  
**Reason:** gocryptfs adds too much complexity for single-user Pi; eCryptfs simpler  
**Trigger:** Revisit if upstream issue has no activity in 2-3 weeks

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

MIT
