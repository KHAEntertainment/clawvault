/**
 * ClawVault Web UI Server
 *
 * Provides an Express-based web interface for submitting secrets directly
 * to the encrypted keyring. Secrets bypass AI context entirely.
 */

import { randomBytes } from 'crypto'
import express, { type Request, Response, NextFunction } from 'express'
import helmet from 'helmet'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import { type StorageProvider } from '../storage/index.js'
import { submitSecret } from './routes/submit.js'
import { statusRoute } from './routes/status.js'
import { apiCreateRequest, requestForm, requestSubmit } from './routes/requests.js'
import { manageList, manageUpdate } from './routes/manage.js'
import { SecretRequestStore } from './requests/store.js'
import { decideInsecureHttpPolicy, isLocalhostBinding } from './network-policy.js'
import { CLAWVAULT_LOGO_JPG_BASE64 } from './assets/logo-jpg-base64.js'
import type { AuditEvent } from '../storage/audit.js'

export interface WebServerOptions {
  port: number
  host: string
  tls?: { cert: string; key: string }
  allowInsecureHttp?: boolean
  requestStore?: SecretRequestStore
  requestTtlMs?: number
}

export interface ServerStartResult {
  token: string
  origin: string
  requestStore: SecretRequestStore
  close: () => Promise<void>
}

export async function createServer(
  storage: StorageProvider,
  options: WebServerOptions,
  token: string
): Promise<express.Application> {
  if (!options.requestStore) {
    throw new Error('requestStore is required')
  }
  const requestStore = options.requestStore
  const app = express()

  // Generate CSRF token for manage dashboard
  const csrfToken = randomBytes(16).toString('hex')

  // --- Helmet: comprehensive security headers ---
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'"],
        connectSrc: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        ...(options.tls ? {} : { upgradeInsecureRequests: null })
      }
    },
    hsts: options.tls ? { maxAge: 31536000, includeSubDomains: true } : false,
    referrerPolicy: { policy: 'no-referrer' }
  }))

  // --- CORS: lock to own origin ---
  const protocol = options.tls ? 'https' : 'http'
  const origin = `${protocol}://${options.host}:${options.port}`
  app.use(cors({ origin, credentials: false }))

  // --- Rate limiting ---
  const submitLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many requests. Try again later.' }
  })

  const manageLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false
  })

  // --- Body parsing ---
  app.use(express.urlencoded({ extended: true }))
  app.use(express.json({ limit: '64kb' }))

  // --- Bearer token auth for API routes ---
  const authMiddleware = (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization
    if (!authHeader || authHeader !== `Bearer ${token}`) {
      res.status(401).json({ success: false, error: 'Unauthorized: invalid or missing bearer token' })
      return
    }
    next()
  }

  // --- Audit event emitter ---
  const emitAudit = (event: AuditEvent): void => {
    try {
      process.stderr.write(JSON.stringify(event) + '\n')
    } catch {
      // Never let audit logging crash the process
    }
  }

  // Mock config for manage dashboard (metadata lookup)
  const mockConfig = { secrets: {} as Record<string, any> }

  // --- Health check (no auth required) ---
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: Date.now() })
  })

  // --- Static assets (no auth required) ---
  app.get('/static/requests.js', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store')
    res.type('application/javascript').send(`// ClawVault request form UX helpers
(() => {
  function byId(id){ return document.getElementById(id); }
  function setStatus(btn, msg, text, workingLabel){
    if (btn) { btn.disabled = true; btn.textContent = workingLabel || 'Working...'; }
    if (msg) { msg.textContent = text; }
  }

  window.addEventListener('DOMContentLoaded', () => {
    const closeBtn = byId('closeBtn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        const closeMsg = byId('closeMsg');
        window.close();
        setTimeout(() => {
          try {
            if (closeMsg) closeMsg.textContent = 'All set. You can close this tab.';
            window.location.replace('about:blank');
          } catch {}
        }, 150);
      });
    }

    const form = byId('secretForm');
    const btn = byId('submitBtn');
    const msg = byId('statusMsg');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const mode = (form.dataset && form.dataset.mode) ? form.dataset.mode : 'create';
      const workingLabel = mode === 'update' ? 'Updating...' : 'Storing...';
      setStatus(btn, msg, mode === 'update' ? 'Updating... please wait' : 'Submitting... please wait', workingLabel);

      try {
        const body = new URLSearchParams(new FormData(form) as any);
        const resp = await fetch(form.action, {
          method: 'POST',
          body,
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }
        });

        if (resp.ok) {
          const html = await resp.text();
          document.open();
          document.write(html);
          document.close();
          return;
        }

        if (msg) {
          if (resp.status === 400) {
            msg.textContent = 'Invalid submission. Please check the value and retry.';
          } else if (resp.status === 410) {
            msg.textContent = 'This link has expired or already been used.';
          } else if (resp.status === 429) {
            msg.textContent = 'Too many requests. Please wait a few minutes and try again.';
          } else if (resp.status >= 500) {
            msg.textContent = 'Server error. Please try again in a moment.';
          } else {
            msg.textContent = 'Submission failed. Please try again.';
          }
        }
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Submit';
        }
      } catch {
        if (msg) msg.textContent = 'Network error. Please retry.';
      }
    });
  });
})();
`)
  })

  // Logo asset
  app.get('/static/logo.jpg', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'public, max-age=3600')
    const buf = Buffer.from(CLAWVAULT_LOGO_JPG_BASE64, 'base64')
    res.type('image/jpeg').send(buf)
  })

  // --- API routes (auth required) ---
  app.post('/api/submit', authMiddleware, submitLimiter, (req: Request, res: Response) => submitSecret(req, res, storage))
  app.get('/api/status', authMiddleware, (req: Request, res: Response) => statusRoute(req, res, storage))
  app.post('/api/requests', authMiddleware, (req: Request, res: Response) => apiCreateRequest(req, res, requestStore))

  // --- Manage dashboard routes (auth required) ---
  app.get('/manage', authMiddleware, manageLimiter, (req: Request, res: Response) => 
    manageList(req, res, { storage, config: mockConfig, csrfToken, emit: emitAudit }))
  app.post('/manage/:name/update', authMiddleware, manageLimiter, express.urlencoded({ extended: true }), (req: Request, res: Response) => 
    manageUpdate(req, res, { storage, config: mockConfig, csrfToken, emit: emitAudit }))

  // --- HTML forms ---
  app.get('/', (_req: Request, res: Response) => {
    res.status(200).type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ClawVault Web UI</title>
  <style>
    body{font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; max-width: 720px; margin: 40px auto; padding: 0 16px;}
    code{background:#f4f4f5;padding:2px 6px;border-radius:6px;}
    .card{border:1px solid #e4e4e7;border-radius:12px;padding:16px;}
    .muted{color:#52525b;}
    .cv-banner{display:block; width:60%; height:auto; margin:0 auto 18px;}
    @media (min-width: 768px){ .cv-banner{ width:30%; } }
  </style>
</head>
<body>
  <header>
    <img src="/static/logo.jpg" alt="ClawVault" class="cv-banner" />
  </header>

  <p class="muted">This server stores secrets directly to your OS keyring / system credentials store.</p>

  <div class="card">
    <h2>API access</h2>
    <p class="muted">Use the bearer token printed in your terminal.</p>
    <p><code>POST /api/submit</code> (auth required)</p>
    <p><code>GET /api/status</code> (auth required)</p>
    <p><code>GET /manage</code> (auth required) — Secret management dashboard</p>
    <p><code>POST /manage/:name/update</code> (auth required) — Update secret</p>
    <p><code>POST /api/requests</code> (auth required)</p>
    <p><code>GET /requests/:id</code> (no auth)</p>
  </div>

  <p class="muted" style="margin-top:16px;">Tip: For the best UX, use <code>clawvault request SECRET_NAME</code> and share the generated one-time link.</p>
  <p style="color:#d4d4d8;font-size:11px;margin-top:24px;text-align:center;">ClawVault 0.2.0</p>
</body>
</html>`)
  })

  // One-time request pages do NOT require bearer token
  app.get('/requests/:id', (req: Request, res: Response, next: NextFunction) => {
    requestForm(req, res, requestStore, storage).catch(next)
  })
  app.post('/requests/:id/submit', submitLimiter, express.urlencoded({ extended: true }), (req: Request, res: Response, next: NextFunction) => {
    requestSubmit(req, res, requestStore, storage).catch(next)
  })

  return app
}

export async function startServer(
  storage: StorageProvider,
  options: WebServerOptions
): Promise<ServerStartResult> {
  if (!options.tls) {
    const policy = decideInsecureHttpPolicy(options.host, options.allowInsecureHttp ?? false)
    if (!policy.allow) {
      throw new Error(
        'Refusing to bind non-localhost over HTTP. Use Tailscale (recommended) or enable TLS. ' +
        'To override (strongly discouraged), pass --allow-insecure-http.'
      )
    }
  }

  const token = randomBytes(32).toString('hex')
  const requestStore = options.requestStore ?? new SecretRequestStore({ ttlMs: options.requestTtlMs })
  const app = await createServer(storage, { ...options, requestStore }, token)

  const protocol = options.tls ? 'https' : 'http'

  let server: import('http').Server | import('https').Server
  if (options.tls) {
    const https = await import('https')
    const fs = await import('fs')

    server = https.createServer(
      { cert: fs.readFileSync(options.tls.cert), key: fs.readFileSync(options.tls.key) },
      app
    )

    await new Promise<void>((resolve, reject) => {
      server.listen(options.port, options.host, () => resolve())
      server.on('error', reject)
    })
  } else {
    server = app.listen(options.port, options.host)
    await new Promise<void>((resolve, reject) => {
      server.on('listening', () => resolve())
      server.on('error', reject)
    })
  }

  const addr = server.address?.() as any
  const port = addr?.port ?? options.port
  const origin = `${protocol}://${options.host}:${port}`

  const close = async (): Promise<void> => {
    requestStore.stopCleanup()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }

  return { token, origin, requestStore, close }
}

export { isLocalhostBinding }
export { decideInsecureHttpPolicy } from './network-policy.js'
export { isTailscaleHost } from './network-policy.js'
