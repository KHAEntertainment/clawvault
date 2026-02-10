## Condensed notes to send to the OpenClaw agent (copy/paste)

* **Root cause:** `auth-profiles.json` is loaded "raw" (plain `JSON.parse`) and **does not go through env substitution**, unlike main config which supports `${VAR}` substitution. So `${ENV_VAR}` stays literally `${ENV_VAR}` and breaks anything expecting a real token.
* **Why OAuth breaks harder than API keys:** OpenClaw **parses OAuth access tokens as JWTs** to read `sub` (accountId), `email`, and `exp`. A placeholder string isn't a JWT → parsing fails. API keys often work because they're passed through as opaque strings.
* **Implication for ClawVault migration:** Replacing values in `auth-profiles.json` with `${…}` **cannot work** until OpenClaw supports env substitution (or another indirection mechanism) for that file.
* **Best product fix (upstream):** Patch OpenClaw so `auth-profiles.json` gets the **same env-substitution behavior as config**. Implementation: after JSON load, run a deep env resolver on all string leaves (same `${VAR_NAME}` rules as config). Env values must still be the **actual JWT**.
* **Best interim hardening for your current Pi/systemd setup:** Don't fight OpenClaw's loader—**encrypt at rest at the filesystem layer** (gocryptfs). OpenClaw continues reading the same plaintext path, but the underlying storage is encrypted.
* **Where the file lives:** Model auth profiles are stored under `~/.openclaw/agents/<agentId>/agent/auth-profiles.json` (per OpenClaw docs).

---

## Interim hardening (recommended): gocryptfs + systemd (Raspberry Pi baremetal)

This keeps OpenClaw unchanged and removes plaintext-at-rest risk for `auth-profiles.json`.

### Why this is the "fast win"

* No OpenClaw patch required.
* No JWT parsing issues (OpenClaw still sees real tokens).
* Compatible with your current "stable restore" state.
* ClawVault already expects headless Linux to use `systemd-creds`, so this fits your environment.

### Key pieces

* **Encrypted dir (ciphertext):** e.g. `/var/lib/openclaw/auth-profiles.enc`
* **Decrypted mountpoint (plaintext view):** the *existing* directory where OpenClaw expects `auth-profiles.json` (example: `~/.openclaw/agents/main/agent/`)
* **systemd credential for the gocryptfs passphrase:** stored encrypted under `/etc/credstore.encrypted/` and loaded at runtime using `LoadCredentialEncrypted=`.
* **gocryptfs `-allow_other` (only if OpenClaw runs as a different user than the mounter):** requires `user_allow_other` in `/etc/fuse.conf`.
* **Non-interactive mount:** use `-passfile` (supported by gocryptfs) pointing to the credential file exposed to the unit.

### Concrete setup steps (adapt paths)

1. **Find the real path**

```bash
# most common location per docs:
ls -la ~/.openclaw/agents/*/agent/auth-profiles.json
```

(If you run OpenClaw as a service user, do this as that user or check its `OPENCLAW_HOME`.)

2. **Stop OpenClaw**

```bash
sudo systemctl stop openclaw
```

3. **Create encrypted store + mountpoint**
   Example assumes agentId = `main`:

```bash
sudo mkdir -p /var/lib/openclaw/auth-profiles.enc
sudo mkdir -p /home/openclaw/.openclaw/agents/main/agent
sudo chown -R openclaw:openclaw /home/openclaw/.openclaw
```

4. **Initialize gocryptfs**

```bash
sudo apt-get update
sudo apt-get install -y gocryptfs fuse3
sudo gocryptfs -init /var/lib/openclaw/auth-profiles.enc
```

5. **Move current plaintext into the encrypted store**

```bash
# temporary mount to migrate contents
sudo mkdir -p /mnt/auth-profiles.plain
sudo gocryptfs /var/lib/openclaw/auth-profiles.enc /mnt/auth-profiles.plain

sudo rsync -a --delete /home/openclaw/.openclaw/agents/main/agent/ /mnt/auth-profiles.plain/
sudo fusermount -u /mnt/auth-profiles.plain
sudo rmdir /mnt/auth-profiles.plain
```

6. **Store the gocryptfs password as a systemd encrypted credential**
   This avoids keeping the passphrase in plaintext on disk. (systemd handles decrypt-on-start)

```bash
sudo mkdir -p /etc/credstore.encrypted
# prompts securely:
sudo systemd-ask-password -n "gocryptfs passphrase for OpenClaw auth-profiles:" \
  | sudo systemd-creds encrypt --name=openclaw-auth-profiles-gocryptfs - \
    /etc/credstore.encrypted/openclaw-auth-profiles-gocryptfs.cred
```

7. **Create a mount service**
   Create: `/etc/systemd/system/openclaw-auth-profiles-gocryptfs.service`

```ini
[Unit]
Description=Mount OpenClaw auth-profiles via gocryptfs
Before=openclaw.service
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
User=root
Group=root

# Load encrypted credential (decrypted at runtime into $CREDENTIALS_DIRECTORY)
LoadCredentialEncrypted=gocryptfs_pass:/etc/credstore.encrypted/openclaw-auth-profiles-gocryptfs.cred

# Mount ciphertext -> plaintext view where OpenClaw expects auth-profiles.json
ExecStart=/bin/sh -lc 'gocryptfs -passfile "$CREDENTIALS_DIRECTORY/gocryptfs_pass" /var/lib/openclaw/auth-profiles.enc /home/openclaw/.openclaw/agents/main/agent'
ExecStop=/bin/sh -lc 'fusermount -u /home/openclaw/.openclaw/agents/main/agent || true'

[Install]
WantedBy=multi-user.target
```

8. **Enable + start + chain OpenClaw to it**

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now openclaw-auth-profiles-gocryptfs.service

# ensure OpenClaw starts after the mount:
sudo systemctl edit openclaw
```

In the editor, add:

```ini
[Unit]
Requires=openclaw-auth-profiles-gocryptfs.service
After=openclaw-auth-profiles-gocryptfs.service
```

Then:

```bash
sudo systemctl start openclaw
```

That's the interim approach I'd still recommend for your "secure now, don't break prod" requirement.

---

## Opencode-agent prompt for implementing this inside ClawVault (ready to paste)

```text
You are working in https://github.com/KHAEntertainment/clawvault (TypeScript). Goal: add an "OpenClaw OAuth at-rest hardening" module that secures auth-profiles.json WITHOUT relying on env-substitution (OpenClaw currently loads auth-profiles.json raw, so ${VAR} breaks JWT parsing).

Deliverables:
1) A new command: `clawvault openclaw harden oauth` (or `clawvault openclaw harden auth-profiles`) that:
   - Detects OpenClaw auth profile path(s): ~/.openclaw/agents/<agentId>/agent/auth-profiles.json (agentId default "main", allow flag `--agent <id>` and `--openclaw-home <path>`).
   - Creates a ciphertext directory (default /var/lib/openclaw/auth-profiles.enc) and mounts it onto the *existing* plaintext directory that contains auth-profiles.json (the directory, not just the file), so OpenClaw sees normal files.
   - Migrates existing plaintext contents into the encrypted store safely (rsync into a temporary mount, backup first).
   - Installs systemd units to mount at boot and ensures the OpenClaw systemd service Requires/After this mount service.

2) Credentials handling:
   - Use systemd credentials, not env vars.
   - Create encrypted credential in /etc/credstore.encrypted/ via `systemd-creds encrypt` (prompt passphrase with `systemd-ask-password`).
   - systemd unit uses `LoadCredentialEncrypted=` and passes it to gocryptfs via `-passfile "$CREDENTIALS_DIRECTORY/<name>"`.
   - Document optional `-allow_other` and /etc/fuse.conf `user_allow_other` requirement if OpenClaw runs as a different user than the mounter.

3) Repo files (respect naming convention):
   - Add docs: `STD_openclaw-oauth-hardening.md` explaining the limitation (auth-profiles.json has no env substitution) and why gocryptfs works.
   - Add ADR: `STD_ADR-0001_openclaw-auth-profiles-at-rest-encryption.md` documenting decision + threat model + rollback.
   - Add templates under a folder like `systemd-templates/`:
       * `PRJ-clawvault_openclaw-auth-profiles-gocryptfs.service` (template unit)
       * `PRJ-clawvault_openclaw.service.d-requires-authprofiles.conf` (drop-in snippet)
     Installation copies them to proper systemd locations (renamed as needed).

4) Implementation details:
   - Add a small helper to run privileged steps (detect if root; if not, print exact sudo commands or error).
   - Add rollback command: `clawvault openclaw harden oauth --rollback` to stop OpenClaw, unmount, restore backup, disable units.
   - Add a `--dry-run` option that prints steps without modifying system.
   - Add tests for path resolution + rendered unit templates (string snapshots).

Acceptance criteria:
- After running harden, auth-profiles.json is not stored plaintext on disk (ciphertext under /var/lib/openclaw/auth-profiles.enc).
- Reboot-safe: systemd mounts before OpenClaw starts.
- No changes required to OpenClaw itself; OAuth JWT parsing continues to work.
- Clear README/ADR explaining why ${ENV_VAR} cannot work today and how the hardening compensates.
```

---

## On the GitHub issue (env substitution in auth-profiles.json)

Yes — **patching OpenClaw** to support env substitution in `auth-profiles.json` is the best "right product fix," because it removes the need for filesystem tricks and aligns with how OpenClaw already documents `${VAR}` substitution for config.

But I'd still do gocryptfs now, because even with env substitution, you still have the operational risk that an env var might be missing/rotated/wrong at boot and prevent the agent from starting, whereas the encrypted-at-rest mount is very deterministic.
