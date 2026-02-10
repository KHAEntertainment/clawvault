# Secret Requests (Confidant-Style)

The safest way to receive secrets. Creates a one-time URL where users can submit credentials directly to encrypted storage — no chat logs, no context exposure.

## Overview

**Why use this?**  
When an AI agent needs a secret from a user, asking them to paste it in chat exposes the credential to:
- Chat logs
- AI context windows  
- Message history

**The solution:** Generate a secure, one-time URL. The user opens it in their browser, submits the secret directly to their OS keyring, and the agent never sees the value in transit.

---

## Quick Start

```bash
# Basic usage (localhost only)
clawvault request OPENAI_API_KEY

# Over Tailscale (recommended for remote users)
clawvault request OPENAI_API_KEY --host 100.x.x.x --port 3000

# With TLS (internet-facing)
clawvault request OPENAI_API_KEY --host secrets.example.com --port 443 \
  --tls --cert /path/to/cert.pem --key /path/to/key.pem
```

**[Screenshot Placeholder: Terminal showing request command output]**

---

## How It Works

### Step 1: Generate Request

The agent (or user) runs:

```bash
clawvault request SECRET_NAME --host 100.113.254.117 --port 3000
```

Output:
```
One-time secret request link:
http://100.113.254.117:3000/requests/a1b2c3d4e5f6...

Secret name: OPENAI_API_KEY
Expires: 2/9/2026, 4:15:00 PM
Waiting for submission... (Ctrl+C to cancel)
```

**[Screenshot Placeholder: Terminal with generated URL]**

### Step 2: User Submits Secret

User opens the URL in their browser:

**[Screenshot Placeholder: Browser showing submission form]**

The form shows:
- Secret name (e.g., `OPENAI_API_KEY`)
- Password field for the value
- "Store secret" button

### Step 3: Automatic Detection

When the user clicks "Store secret":
1. Secret is encrypted and stored in OS keyring
2. Success page displays: "✅ Secret Stored Successfully"
3. CLI detects the submission and exits

**[Screenshot Placeholder: Success page with green checkmark]**

### Step 4: Agent Uses Secret

The agent retrieves the secret by name (never the value itself):

```javascript
const storage = await createStorage();
const apiKey = await storage.get('OPENAI_API_KEY');
// Use apiKey for API calls
```

---

## Network Security

### Safe by Default

| Binding | HTTP Allowed? | TLS Required? |
|---------|--------------|---------------|
| `localhost`, `127.0.0.1` | ✅ Yes | Optional |
| Tailscale (`100.x.x.x`) | ⚠️ Yes, with warning | Recommended |
| Other IPs | ❌ No | Required (or `--allow-insecure-http`) |

### Examples

**Local development:**
```bash
clawvault request MY_SECRET  # Defaults to localhost:3000
```

**Tailscale (private network):**
```bash
# Shows warning but allows
clawvault request MY_SECRET --host 100.64.0.5 --port 3000
```

**Internet with TLS:**
```bash
clawvault request MY_SECRET --host secrets.example.com \
  --tls --cert cert.pem --key key.pem
```

**Override (NOT recommended):**
```bash
# Only if you understand the risks
clawvault request MY_SECRET --host 192.168.1.100 \
  --allow-insecure-http  # ⚠️ Shows big red warning
```

---

## Options Reference

```
clawvault request <SECRET_NAME> [options]

Options:
  -p, --port <port>           Port number (default: 3000)
  -H, --host <host>           Host address (default: localhost)
  --tls                       Enable HTTPS
  --cert <path>               TLS certificate path
  --key <path>                TLS key path
  --allow-insecure-http       Allow non-localhost HTTP (dangerous)
  --label <label>            Description shown on form
  --timeout-min <minutes>    Request expiry time (default: 15)
```

---

## Security Features

- **One-time use:** Link becomes invalid after first submission
- **Time-limited:** Default 15-minute expiry (configurable)
- **Rate limited:** 30 submissions per 15 minutes per IP
- **No echo:** Success page never shows the secret value
- **Atomic:** Race-condition safe (can't submit twice simultaneously)
- **Encrypted:** Stored directly to OS keyring (systemd-creds/Secret Service/Keychain)

---

## Troubleshooting

### "Refusing to bind non-localhost over HTTP"

**Solution:** Use Tailscale, enable TLS, or pass `--allow-insecure-http` (not recommended).

### Browser shows old form (caching)

**Solution:** Open in private/incognito mode, or clear browser cache.

### "Request expired" before submission

**Solution:** Generate a new link. Default expiry is 15 minutes; use `--timeout-min` to extend.

### Can't reach the server

**Solution:** Ensure Tailscale is running on both devices and the host is accessible:
```bash
# On server
 tailscale status

# On client
 ping 100.x.x.x  # Should respond
```

---

## Comparison: Secret Request vs. Chat

| Method | Secure? | In Logs? | In AI Context? | Easy for Users? |
|--------|---------|----------|----------------|-----------------|
| Paste in chat | ❌ No | ✅ Yes | ✅ Yes | ✅ Very |
| Secret request link | ✅ Yes | ❌ No | ❌ No | ✅ Yes |

---

## See Also

- [Migration Guide](MIGRATION.md) — Migrate existing OpenClaw secrets
- [CLI Reference](CLI.md) — All commands and options
- [Security Model](SECURITY.md) — Detailed threat model
