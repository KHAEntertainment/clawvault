/**
 * Secret Management Dashboard Routes
 *
 * Provides GET /manage (list secrets with metadata only) and
 * POST /manage/:name/update (update secret via password input)
 *
 * Security: Never fetches or renders secret values.
 * Uses CSRF token from server context for protection.
 */

import { type Request, type Response } from 'express'
import { type StorageProvider } from '../../storage/index.js'

// Trigger code review

interface SecretMetadata {
  name: string
  description?: string | null
  provider?: string | null
  required?: boolean
  rotationEnabled?: boolean
}

interface ConfigSchema {
  secrets?: {
    [name: string]: {
      description?: string
      provider?: string
      required?: boolean
      rotation?: {
        enabled?: boolean
      }
    }
  }
}

interface ManageContext {
  storage: StorageProvider
  config: ConfigSchema
  csrfToken: string
  emit: (event: any) => void
}

/**
 * Escape HTML entities to prevent XSS attacks.
 */
function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/**
 * Render the secret management dashboard HTML page.
 */
function htmlManagePage(
  title: string,
  secrets: SecretMetadata[],
  csrfToken: string,
  updatedSecret?: string,
  errorMessage?: string
): string {
  const successBanner = updatedSecret
    ? `<div style="background: #d1fae5; border: 1px solid #34d399; color: #065f46; padding: 12px 16px; border-radius: 4px; margin-bottom: 16px;">
        <strong>✅</strong> Secret <code>${escapeHtml(updatedSecret)}</code> updated successfully!
      </div>`
    : ''

  const errorBanner = errorMessage
    ? `<div style="background: #fef2f2; border: 1px solid #f87171; color: #b91c1c; padding: 12px 16px; border-radius: 4px; margin-bottom: 16px;">
        <strong>⚠️</strong> ${escapeHtml(errorMessage)}
      </div>`
    : ''

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    body {
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
      max-width: 720px;
      margin: 40px auto;
      padding: 0 16px;
    }
    .card {
      border: 1px solid #e4e4e7;
      border-radius: 12px;
      padding: 16px;
    }
    .muted {
      color: #52525b;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
    }
    th, td {
      padding: 8px 12px;
      text-align: left;
      border-bottom: 1px solid #e4e4e7;
    }
    th {
      background: #f4f4f5;
      font-weight: 600;
    }
    input[type="password"] {
      width: 100%;
      padding: 10px;
      border: 1px solid #d4d4d8;
      border-radius: 6px;
      font-size: 14px;
      margin: 8px 0;
    }
    button {
      background: #111827;
      color: #fff;
      border: none;
      padding: 10px 14px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      margin-right: 8px;
    }
    button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .badge {
      display: inline-block;
      padding: 2px 6px;
      background: #e0e7ff;
      color: #3730a3;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
    }
    .actions-cell {
      text-align: right;
      width: 200px;
    }
    .expand-form {
      display: none;
      padding: 16px;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      margin-top: 16px;
    }
  </style>
</head>
<body>
  ${successBanner}${errorBanner}
  
  <div class="card">
    <h1>Secret Management Dashboard</h1>
    
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Description</th>
          <th>Provider</th>
          <th>Required</th>
          <th>Rotation</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${secrets.map(secret => {
          const desc = secret.description ? escapeHtml(secret.description) : '<span class="muted">No description</span>'
          const provider = secret.provider ? escapeHtml(secret.provider) : '<span class="muted">N/A</span>'
          const requiredBadge = secret.required
            ? '<span class="badge">Required</span>'
            : ''
          const rotationBadge = secret.rotationEnabled
            ? '<span class="badge">Enabled</span>'
            : ''
          
          return `<tr>
            <td><code>${escapeHtml(secret.name)}</code></td>
            <td>${desc}</td>
            <td>${provider}</td>
            <td>${requiredBadge}</td>
            <td>${rotationBadge}</td>
            <td class="actions-cell">
              <button
                data-secret="${escapeHtml(secret.name)}"
                onclick="toggleExpandForm(this)"
              >
                Update
              </button>
            </td>
          </tr>`
        }).join('')}
      </tbody>
    </table>
    
    ${secrets.length === 0 ? '<p class="muted">No secrets stored yet.</p>' : ''}
    
    ${secrets.map(secret => `
      <div id="update-form-${escapeHtml(secret.name)}" class="expand-form">
        <h2>Update Secret: <code>${escapeHtml(secret.name)}</code></h2>
        <form method="POST" action="/manage/${encodeURIComponent(secret.name)}/update">
          <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
          <label>
            New Secret Value
            <span class="muted" style="font-size: 12px; display: block; margin-bottom: 8px;">
              Enter new value for <code>${escapeHtml(secret.name)}</code>
            </span>
          </label>
          <input type="password" name="secretValue" required autocomplete="off" autofocus />
          <button type="submit">Save</button>
          <button type="button" onclick="hideAllExpandForms()">Cancel</button>
        </form>
      </div>
    `).join('')}
    
    <script>
      function toggleExpandForm(btn) {
        const formId = 'update-form-' + btn.getAttribute('data-secret')
        const forms = document.querySelectorAll('.expand-form')
        forms.forEach(form => {
          if (form.id !== formId) {
            form.style.display = 'none'
          }
        })
        
        const targetForm = document.getElementById(formId)
        if (targetForm) {
          targetForm.style.display = 'block'
        }
      }
      
      function hideAllExpandForms() {
        const forms = document.querySelectorAll('.expand-form')
        forms.forEach(form => {
          form.style.display = 'none'
        })
      }
    </script>
  </body>
</html>`
}

/**
 * GET /manage - List all secrets with metadata only.
 */
export async function manageList(
  _req: Request,
  res: Response,
  context: ManageContext
): Promise<void> {
  try {
    const secretNames = await context.storage.list()
    const secrets: SecretMetadata[] = []
    
    for (const name of secretNames) {
      const configSecret = context.config.secrets?.[name]
      secrets.push({
        name,
        description: configSecret?.description || null,
        provider: configSecret?.provider || null,
        required: configSecret?.required || false,
        rotationEnabled: configSecret?.rotation?.enabled || false
      })
    }
    
    context.emit({ timestamp: new Date().toISOString(), operation: 'list', source: 'manage-dashboard', success: true })
    
    res.status(200).type('html').send(htmlManagePage(
      'Secret Management Dashboard',
      secrets,
      context.csrfToken
    ))
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    context.emit({ timestamp: new Date().toISOString(), operation: 'list', source: 'manage-dashboard', success: false, errorMessage: message })
    
    res.status(500).type('html').send(htmlManagePage(
      'Secret Management Dashboard',
      [],
      context.csrfToken,
      undefined,
      message
    ))
  }
}

/**
 * POST /manage/:name/update - Update a secret via password input.
 */
export async function manageUpdate(
  req: Request,
  res: Response,
  context: ManageContext
): Promise<void> {
  const name = req.params.name
  
  try {
    // Validate secret name format
    const namePattern = /^[A-Z][A-Z0-9_]*$/
    if (!namePattern.test(name)) {
      context.emit({ timestamp: new Date().toISOString(), operation: 'set', secretName: name, source: 'manage-dashboard', success: false, errorMessage: 'Invalid secret name format' })
      res.status(400).type('html').send(htmlManagePage(
        'Secret Management Dashboard',
        [],
        context.csrfToken,
        undefined,
        'Invalid secret name format. Must start with uppercase letter and contain only alphanumeric characters and underscores.'
      ))
      return
    }
    
    // Validate CSRF token
    const csrfTokenFromBody = req.body._csrf
    if (csrfTokenFromBody !== context.csrfToken) {
      context.emit({ timestamp: new Date().toISOString(), operation: 'set', secretName: name, source: 'manage-dashboard', success: false, errorMessage: 'Invalid CSRF token' })
      res.status(403).type('html').send(htmlManagePage(
        'Secret Management Dashboard',
        [],
        context.csrfToken,
        undefined,
        'Invalid CSRF token. Please refresh the page.'
      ))
      return
    }
    
    // Validate secret value is not empty
    if (typeof req.body.secretValue !== 'string' || req.body.secretValue.length === 0) {
      context.emit({ timestamp: new Date().toISOString(), operation: 'set', secretName: name, source: 'manage-dashboard', success: false, errorMessage: 'Secret value cannot be empty' })
      res.status(400).type('html').send(htmlManagePage(
        'Secret Management Dashboard',
        [],
        context.csrfToken,
        undefined,
        'Secret value cannot be empty.'
      ))
      return
    }
    
    // Store the secret
    await context.storage.set(name, req.body.secretValue)
    
    context.emit({ timestamp: new Date().toISOString(), operation: 'set', secretName: name, source: 'manage-dashboard', success: true })
    
    // Redirect to /manage with success banner
    res.redirect(303, `/manage?updated=${encodeURIComponent(name)}`)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    context.emit({ timestamp: new Date().toISOString(), operation: 'set', secretName: name, source: 'manage-dashboard', success: false, errorMessage: message })
    
    res.status(500).type('html').send(htmlManagePage(
      'Secret Management Dashboard',
      [],
      context.csrfToken,
      undefined,
      message
    ))
  }
}