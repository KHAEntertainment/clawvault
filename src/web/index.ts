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
import { CLAWVAULT_LOGO_JPG_BASE64 } from './assets/logo-jpg-base64.js'

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
  function setStatus(btn, msg, text, workingLabel){
    if (btn) { btn.disabled = true; btn.textContent = workingLabel || 'Working...'; }
    if (msg) { msg.textContent = text; }
  }

  window.addEventListener('DOMContentLoaded', () => {
    // Close button on success page
    const closeBtn = byId('closeBtn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        const closeMsg = byId('closeMsg');
        // Attempt to close (works reliably for scripted windows). For normal tabs,
        // most mobile browsers will ignore window.close().
        window.close();

        // Fallback: many mobile browsers block closing a regular tab.
        // In that case, at least clear the page and show a helpful message.
        setTimeout(() => {
          try {
            if (closeMsg) closeMsg.textContent = 'All set. You can close this tab.';
            window.location.replace('about:blank');
          } catch {}
        }, 150);
      });
    }

    // Request form submit UX
    const form = byId('secretForm');
    const btn = byId('submitBtn');
    const msg = byId('statusMsg');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      // Prevent immediate navigation so the user actually sees feedback.
      e.preventDefault();

      const mode = (form.dataset && form.dataset.mode) ? form.dataset.mode : 'create';
      const workingLabel = mode === 'update' ? 'Updating...' : 'Storing...';
      setStatus(btn, msg, mode === 'update' ? 'Updating... please wait' : 'Submitting... please wait', workingLabel);

      try {
        // Server expects application/x-www-form-urlencoded (express.urlencoded).
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

        // Keep user on the same page for simple validation failures.
        if (msg) msg.textContent = 'Invalid submission. Please check the value and retry.';
        if (btn) {
          const def = (btn.dataset && btn.dataset.defaultText) ? btn.dataset.defaultText : 'Submit';
          btn.disabled = false;
          btn.textContent = def;
        }
      } catch {
        if (msg) msg.textContent = 'Network error. Please retry.';
        if (btn) {
          const def = (btn.dataset && btn.dataset.defaultText) ? btn.dataset.defaultText : 'Submit';
          btn.disabled = false;
          btn.textContent = def;
        }
      }
    });
  });
})();
`)
  })

  // Logo asset (embedded to avoid filesystem path issues in ESM builds)
  app.get('/static/logo.jpg', (_req: Request, res: Response) => {
    const buf = Buffer.from(CLAWVAULT_LOGO_JPG_BASE64, 'base64')
    res.type('image/jpeg').send(buf)
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
    <p><code>POST /api/requests</code> (auth required)</p>
    <p><code>GET /requests/:id</code> (no auth)</p>
  </div>

  <p class="muted" style="margin-top:16px;">Tip: For the best UX, use <code>clawvault request SECRET_NAME</code> and share the generated one-time link.</p>
</body>
</html>`)
  })

  // One-time request pages do NOT require bearer token
  // Apply rate limiting to submission endpoint
  app.get('/requests/:id', (req: Request, res: Response, next: NextFunction) => {
    requestForm(req, res, requestStore, storage).catch(next)
  })
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
