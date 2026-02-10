/**
 * ClawVault Web UI Server
 *
 * Provides an Express-based web interface for submitting secrets directly
 * to the encrypted keyring. Secrets bypass AI context entirely.
 *
 * Security architecture (for agents troubleshooting issues):
 *
 * 1. BINDING: Server binds to localhost (127.0.0.1) by default. Binding to
 *    any other host triggers a prominent warning because it exposes the
 *    secret-submission endpoint to the network.
 *
 * 2. AUTH TOKEN: On startup a one-time bearer token is generated and printed
 *    to the terminal. All API requests must include this token in the
 *    Authorization header. The HTML form injects it automatically via a
 *    template variable. This prevents other local processes from using the
 *    API without the token.
 *
 * 3. RATE LIMITING: /api/submit is limited to 30 requests per 15-minute
 *    window per IP. This prevents brute-force writes to the keyring.
 *
 * 4. CORS: Origin is locked to the server's own origin (scheme://host:port).
 *    Cross-origin requests from malicious browser pages are blocked.
 *
 * 5. HELMET: Standard security headers (CSP, HSTS, X-Frame-Options, etc.)
 *    are applied by helmet middleware.
 *
 * 6. NO SECRET VALUES IN RESPONSES: The /api/submit route returns metadata
 *    only (name + length). The /api/status route returns names only.
 *    There is intentionally no "get secret" endpoint.
 *
 * If a user reports "403 Forbidden" or "Unauthorized":
 *   → They need the bearer token printed at startup.
 * If a user reports "CORS error":
 *   → They are accessing from a different origin (e.g. a browser extension).
 *     They must use the same origin the server is bound to.
 * If a user reports "Too many requests":
 *   → Rate limit hit. Wait 15 minutes or restart the server.
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
import { SecretRequestStore } from './requests/store.js'
import { decideInsecureHttpPolicy, isLocalhostBinding } from './network-policy.js'

export interface WebServerOptions {
  /** Port to listen on (default: 3000) */
  port: number
  /** Host to bind to (default: 'localhost') */
  host: string
  /** Optional TLS configuration for HTTPS */
  tls?: {
    cert: string
    key: string
  }
  /** Allow binding non-localhost over HTTP (strongly discouraged) */
  allowInsecureHttp?: boolean
  /** Optional request store (used for one-time secret request links) */
  requestStore?: SecretRequestStore
  /** Override default request TTL (ms) */
  requestTtlMs?: number
}

export interface ServerStartResult {
  /** Bearer token required for API access */
  token: string
  /** Server origin (scheme://host:port) */
  origin: string
  /** One-time request store */
  requestStore: SecretRequestStore
  /** Close server */
  close: () => Promise<void>
}


/**
 * Create and configure the Express application.
 *
 * @param storage - Storage provider instance
 * @param options - Server configuration options
 * @param token  - Bearer token for API auth
 * @returns Configured Express app
 */
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
        // IMPORTANT: helmet enables `upgrade-insecure-requests` by default, which breaks
        // HTTP-only (no TLS) tailscale/localhost deployments by rewriting subresource loads
        // and form posts to https.
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

  // --- Rate limiting on submission endpoint ---
  const submitLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many requests. Try again later.' }
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

  // --- Health check (no auth required) ---
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: Date.now() })
  })

  // --- Static assets (no auth required) ---
  app.get('/static/requests.js', (_req: Request, res: Response) => {
    res.type('application/javascript').send(`// ClawVault request form UX helpers
(() => {
  function byId(id){ return document.getElementById(id); }
  function setStatus(btn, msg, text){
    if (btn) { btn.disabled = true; btn.textContent = 'Storing...'; }
    if (msg) { msg.textContent = text; }
  }

  window.addEventListener('DOMContentLoaded', () => {
    const form = byId('secretForm');
    const btn = byId('submitBtn');
    const msg = byId('statusMsg');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      // Prevent immediate navigation so the user actually sees feedback.
      e.preventDefault();
      setStatus(btn, msg, 'Submitting... please wait');

      try {
        const body = new FormData(form);
        const resp = await fetch(form.action, { method: 'POST', body, credentials: 'same-origin' });
        const html = await resp.text();
        document.open();
        document.write(html);
        document.close();
      } catch {
        if (msg) msg.textContent = 'Network error. Please retry.';
        if (btn) { btn.disabled = false; btn.textContent = 'Store secret'; }
      }
    });
  });
})();
`)
  })

  // Placeholder logo (SVG). Replace later with the provided PNG once added to the repo.
  app.get('/static/logo.svg', (_req: Request, res: Response) => {
    res.type('image/svg+xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="g" x1="0" x2="1">
      <stop offset="0" stop-color="#b91c1c"/>
      <stop offset="1" stop-color="#9f1239"/>
    </linearGradient>
  </defs>
  <rect x="2" y="2" width="60" height="60" rx="14" fill="#0b0b0c" stroke="#2a2a2e"/>
  <path d="M22 28c0-6 4-10 10-10s10 4 10 10v6h2c1.1 0 2 .9 2 2v10c0 1.1-.9 2-2 2H20c-1.1 0-2-.9-2-2V36c0-1.1.9-2 2-2h2v-6z" fill="#d4d4d8"/>
  <circle cx="32" cy="41" r="4" fill="#111827"/>
  <path d="M12 32c4-6 8-6 12 0-4 6-8 6-12 0z" fill="url(#g)" opacity="0.95"/>
  <path d="M52 32c-4-6-8-6-12 0 4 6 8 6 12 0z" fill="url(#g)" opacity="0.95"/>
</svg>`)
  })

  // --- API routes (auth required) ---
  app.post('/api/submit', authMiddleware, submitLimiter, (req: Request, res: Response) => submitSecret(req, res, storage))
  app.get('/api/status', authMiddleware, (req: Request, res: Response) => statusRoute(req, res, storage))

  // Create one-time secret request link
  app.post('/api/requests', authMiddleware, (req: Request, res: Response) => apiCreateRequest(req, res, requestStore))

  // --- HTML forms ---
  app.get('/', (_req: Request, res: Response) => {
    // Serve a minimal UI inline to avoid filesystem path issues in ESM builds.
    // (One-time request flow lives under /requests/:id.)
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
    input{width:100%;padding:10px;border:1px solid #d4d4d8;border-radius:10px;}
    button{padding:10px 14px;border-radius:10px;border:0;background:#111827;color:#fff;cursor:pointer;}
  </style>
</head>
<body>
  <h1>ClawVault Web UI</h1>
  <p class="muted">This server stores secrets directly to your OS keyring / system credentials store.</p>

  <div class="card">
    <h2>API access</h2>
    <p class="muted">Use the bearer token printed in your terminal.</p>
    <p><code>POST /api/submit</code> (auth required)</p>
    <p><code>POST /api/requests</code> (auth required)</p>
    <p><code>GET /requests/:id</code> (no auth)</p>
  </div>

  <p class="muted" style="margin-top:16px;">Tip: For the best UX, use <code>clawvault request SECRET_NAME</code> and share the generated one-time link.</p>
</body>
</html>`)
  })

  // One-time request pages do NOT require bearer token
  // Apply rate limiting to submission endpoint
  app.get('/requests/:id', (req: Request, res: Response) => requestForm(req, res, requestStore))
  app.post('/requests/:id/submit', submitLimiter, express.urlencoded({ extended: true }), (req: Request, res: Response, next: NextFunction) => {
    requestSubmit(req, res, requestStore, storage).catch(next)
  })

  return app
}

/**
 * Start the web server.
 *
 * Generates a one-time bearer token, prints it to stdout, and starts
 * listening. Returns the token so the caller can display it.
 */
export async function startServer(
  storage: StorageProvider,
  options: WebServerOptions
): Promise<ServerStartResult> {
  // Enforce insecure HTTP policy if TLS is not enabled.
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
      {
        cert: fs.readFileSync(options.tls.cert),
        key: fs.readFileSync(options.tls.key)
      },
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
