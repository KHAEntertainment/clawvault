import * as express from 'express'
import { type StorageProvider } from '../../storage/index.js'
import { SecretRequestStore } from '../requests/store.js'

type Request = express.Request
type Response = express.Response

interface CreateRequestBody {
  secretName: string
  label?: string
}

const NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/

function htmlPage(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  body{font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; max-width: 720px; margin: 40px auto; padding: 0 16px;}
  code{background:#f4f4f5;padding:2px 6px;border-radius:6px;}
  .card{border:1px solid #e4e4e7;border-radius:12px;padding:16px;}
  .muted{color:#52525b;}
  input[type=password], input[type=text]{width:100%;padding:10px;border:1px solid #d4d4d8;border-radius:10px;}
  button{padding:10px 14px;border-radius:10px;border:0;background:#111827;color:#fff;cursor:pointer;}
  button:disabled{opacity:0.6;cursor:not-allowed;}
</style>
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
<meta http-equiv="Pragma" content="no-cache">
<meta http-equiv="Expires" content="0">
</head><body>
${body}
</body></html>`
}

export function apiCreateRequest(req: Request, res: Response, store: SecretRequestStore): void {
  const { secretName, label } = req.body as CreateRequestBody

  if (!secretName || typeof secretName !== 'string' || !NAME_PATTERN.test(secretName)) {
    res.status(400).json({ success: false, error: 'Invalid secretName format.' })
    return
  }

  const r = store.create(secretName, typeof label === 'string' ? label : undefined)
  res.status(200).json({
    success: true,
    request: {
      id: r.id,
      label: r.label ?? null,
      secretName: r.secretName,
      expiresAt: r.expiresAt,
    }
  })
}

export async function requestForm(req: Request, res: Response, store: SecretRequestStore, storage: StorageProvider): Promise<void> {
  const id = req.params.id
  const r = store.get(id)

  if (!r) {
    res.status(404).send(htmlPage('Request not found', `<h1>Request not found</h1><p class="muted">This link may have expired or already been used.</p>`))
    return
  }

  if (store.isUsed(r)) {
    res.status(410).send(htmlPage('Request used', `<h1>Already used</h1><p class="muted">This secret request has already been completed.</p>`))
    return
  }

  const labelLine = r.label ? `<p class="muted">${escapeHtml(r.label)}</p>` : ''

  const exists = await storage.has(r.secretName)
  const mode: 'create' | 'update' = exists ? 'update' : 'create'
  const heading = exists ? 'Update secret' : 'Submit secret'
  const buttonText = exists ? 'Update secret' : 'Store secret'
  const noteLine = exists
    ? `<p class="muted" style="font-size:12px; margin-top:8px;">This will overwrite the existing secret value for <code>${escapeHtml(r.secretName)}</code>.</p>`
    : `<p class="muted" style="font-size:12px; margin-top:8px;">This will be stored directly into your OS keyring/system credentials store. It will not be shown back.</p>`

  res.status(200).send(htmlPage(heading, `
    <header style="margin-bottom:18px;">
      <style>
        .cv-banner{display:block; width:60%; height:auto; margin:0 auto;}
        @media (min-width: 768px){ .cv-banner{ width:30%; } }
      </style>
      <img src="/static/logo.jpg" alt="ClawVault" class="cv-banner" />
    </header>

    <h1 style="margin-top:0;">${heading}</h1>
    ${labelLine}
    <div class="card">
      <p class="muted">Secret name: <code>${escapeHtml(r.secretName)}</code></p>
      <form method="POST" action="/requests/${encodeURIComponent(r.id)}/submit" id="secretForm" data-mode="${mode}">
        <label for="secretValue" class="muted">Secret value</label><br />
        <input id="secretValue" name="secretValue" type="password" autocomplete="off" required autofocus />
        ${noteLine}
        <button type="submit" id="submitBtn" data-default-text="${escapeHtml(buttonText)}">${buttonText}</button>
        <p id="statusMsg" style="margin-top:10px; color:#6b7280;"></p>
      </form>
    </div>

    <script src="/static/requests.js?v=3" defer></script>
  `))
}

export async function requestSubmit(req: Request, res: Response, store: SecretRequestStore, storage: StorageProvider): Promise<void> {
  const id = req.params.id
  const secretValue = typeof req.body?.secretValue === 'string' ? String(req.body.secretValue) : ''
  if (!secretValue) {
    res.status(400).send(htmlPage('Invalid submission', `<h1>Invalid submission</h1><p class="muted">Secret value cannot be empty.</p>`))
    return
  }

  // Atomically check and mark used before storing to prevent race conditions
  const r = store.tryMarkUsed(id)
  if (!r) {
    res.status(410).send(htmlPage('Request unavailable', `<h1>Request unavailable</h1><p class="muted">This link may have expired or already been used.</p>`))
    return
  }

  try {
    const existed = await storage.has(r.secretName)
    await storage.set(r.secretName, secretValue)
    const verb = existed ? 'Updated' : 'Stored'
    res.status(200).send(htmlPage(verb, `
      <header style="margin-bottom:18px;">
        <style>
          .cv-banner{display:block; width:60%; height:auto; margin:0 auto;}
          @media (min-width: 768px){ .cv-banner{ width:30%; } }
        </style>
        <img src="/static/logo.jpg" alt="ClawVault" class="cv-banner" />
      </header>
      <div style="text-align:center; padding:18px 20px 40px;">
        <div style="font-size:64px; margin-bottom:20px;">✅</div>
        <h1 style="color:#16a34a; margin-bottom:16px;">Secret ${verb} Successfully</h1>
        <p style="font-size:18px; color:#374151; margin-bottom:8px;"><strong>${escapeHtml(r.secretName)}</strong> has been ${verb.toLowerCase()}.</p>
        <p style="color:#6b7280; margin-bottom:16px;">You can safely close this page.</p>

        <button type="button" id="closeBtn" style="min-width: 220px;">Close</button>
        <p id="closeMsg" class="muted" style="margin-top:10px;"></p>
      </div>

      <script src="/static/requests.js?v=3" defer></script>
    `))
  } catch {
    res.status(500).send(htmlPage('Error', `<h1>Failed to store secret</h1><p class="muted">Internal error while storing the secret.</p>`))
  }
}

function escapeHtml(s: string): string {
  // Minimal HTML escaping for text/attribute contexts.
  // Intended for short, non-HTML strings (secret names, labels, titles).
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
