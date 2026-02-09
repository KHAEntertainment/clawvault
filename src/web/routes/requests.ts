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
<title>${title}</title>
<style>
  body{font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; max-width: 720px; margin: 40px auto; padding: 0 16px;}
  code{background:#f4f4f5;padding:2px 6px;border-radius:6px;}
  .card{border:1px solid #e4e4e7;border-radius:12px;padding:16px;}
  .muted{color:#52525b;}
  input[type=password], input[type=text]{width:100%;padding:10px;border:1px solid #d4d4d8;border-radius:10px;}
  button{padding:10px 14px;border-radius:10px;border:0;background:#111827;color:#fff;cursor:pointer;}
  button:disabled{opacity:0.6;cursor:not-allowed;}
</style>
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

export function requestForm(req: Request, res: Response, store: SecretRequestStore): void {
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

  res.status(200).send(htmlPage('Submit secret', `
    <h1>Submit secret</h1>
    ${labelLine}
    <div class="card">
      <p class="muted">Secret name: <code>${escapeHtml(r.secretName)}</code></p>
      <form method="POST" action="/requests/${encodeURIComponent(r.id)}/submit">
        <label for="secretValue" class="muted">Secret value</label><br />
        <input id="secretValue" name="secretValue" type="password" autocomplete="off" required />
        <p class="muted" style="font-size:12px;">This will be stored directly into your OS keyring/system credentials store. It will not be shown back.</p>
        <button type="submit">Store secret</button>
      </form>
    </div>
  `))
}

export async function requestSubmit(req: Request, res: Response, store: SecretRequestStore, storage: StorageProvider): Promise<void> {
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

  const secretValue = typeof req.body?.secretValue === 'string' ? String(req.body.secretValue) : ''
  if (!secretValue) {
    res.status(400).send(htmlPage('Invalid submission', `<h1>Invalid submission</h1><p class="muted">Secret value cannot be empty.</p>`))
    return
  }

  try {
    await storage.set(r.secretName, secretValue)
    store.markUsed(id)
    res.status(200).send(htmlPage('Stored', `<h1>Secret stored</h1><p class="muted">Stored <code>${escapeHtml(r.secretName)}</code>. You can close this page.</p>`))
  } catch {
    res.status(500).send(htmlPage('Error', `<h1>Failed to store secret</h1><p class="muted">Internal error while storing the secret.</p>`))
  }
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
