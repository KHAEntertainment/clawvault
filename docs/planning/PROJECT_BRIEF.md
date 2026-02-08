# ClawVault - Secure Secret Management for OpenClaw

## Vision

Build a full-featured, production-ready secret management system that combines the best of Confidant (UX) and Secret Manager (security), with significant enhancements to create something genuinely useful for the OpenClaw community.

## Current Components (to analyze)

### Confidant
- Strengths: Web UI for secure submission, one-time tokens, nice UX
- Weaknesses: Secrets pass through AI context, not truly secure, security theater
- Source: https://clawhub.ai/ericsantos/confidant

### Secret Manager
- Strengths: System keyring storage (real encryption), never exposes to AI, gateway integration
- Weaknesses: Hardcoded 10 keys, Linux-only, keys end up in config files
- Source: https://clawhub.ai/jswortz/secret-manager

## Requirements

### Core Features
1. **Dynamic Secret Definitions** - Config-based, not hardcoded arrays. Add any secret type on-demand
2. **Platform-Agnostic** - Support Linux (GNOME Keyring), macOS (Keychain), Windows ( Credential Manager)
3. **Secure Web UI** - Submission interface (Confidant-style) but secrets NEVER enter AI context
4. **Keyring Storage** - All secrets encrypted in OS keyring
5. **Gateway Integration** - Inject into environment, not chat logs
6. **Multi-Provider Support** - OpenAI, Anthropic, Google, custom providers
7. **Security-First Design** - No secrets in logs, proper encryption, one-time tokens where appropriate

### Security Enhancements (brainstorm ideas)
- Secret rotation support
- Audit logging (what secret was accessed, when, by which session)
- Temporary/ephemeral secrets with TTL
- Secret versioning
- Encrypted backup/restore
- Optional Vault integration path (future)
- Secure secret sharing between authorized agents

### UX Enhancements
- Interactive CLI (`clawvault add <name>`, `clawvault list`, `clawvault remove`)
- Web UI for submission (Confidant-style)
- Clear security posture documentation (what's actually protected vs not)
- Helpful error messages
- Auto-detection of platform keyring
- Preview mode (show first 4 chars, rest masked)

### Technical Requirements
- Node.js (consistent with OpenClaw ecosystem)
- TypeScript for type safety
- Modular architecture (separate concerns: storage, UI, gateway, config)
- Extensive tests
- Comprehensive documentation
- CLI tool installed via npm
- Skill integration with OpenClaw

## Non-Goals (out of scope for MVP)
- Full HashiCorp Vault replacement (that's enterprise territory)
- Multi-tenant sharing (single-user focused for now)
- Secret replication across machines
- Hardware security modules (HSMs)

## Success Criteria
1. Secrets never enter AI context (non-negotiable)
2. Platform-agnostic keyring support
3. Dynamic secret definitions (no hardcoded limits)
4. Tested and published to ClawHub
5. Clear documentation of security guarantees and limitations

## Team Approach

Use Claude Code Teams to:
1. **Analyze Component Team** - Deep dive into Confidant and Secret Manager code/architecture
2. **Design Team** - Architect the combined system, identify integration points
3. **Implementation Team** - Build the actual ClawVault system
4. **Security Review Team** - Analyze threats, verify no secrets in AI context
5. **Testing Team** - Write comprehensive tests, verify edge cases

Let the Claude Code orchestrator delegate tasks between teams as appropriate.

## Timeline

No hard deadline, but aim for:
- Analysis phase: 1-2 days
- Design phase: 1-2 days
- Implementation phase: 3-5 days
- Testing & documentation: 2-3 days
- Total: ~1-2 weeks for MVP

## Next Step

Launch Claude Code Teams and let them take over analysis and design.
