/**
 * Webhook utilities for ClawVault
 * 
 * Handles firing events to OpenClaw gateway when secrets are submitted
 * via one-time request links.
 */

import { randomBytes } from 'crypto'
import { execSync } from 'child_process'

export interface SecretSubmittedPayload {
  event: string
  name: string
  timestamp: string
  sessionKey?: string
  message: string
}

export interface WebhookOptions {
  gatewayUrl?: string
  gatewayToken?: string
  timeout?: number
}

/**
 * Validate and sanitize sessionKey to prevent injection
 */
function sanitizeSessionKey(key?: string): string | undefined {
  if (!key) return undefined
  // Limit length and remove any newlines
  return key.slice(0, 256).replace(/[\r\n]/g, '')
}

/**
 * Fire a system event to the OpenClaw gateway when a secret is submitted
 */
export async function fireSecretSubmittedWebhook(
  secretName: string,
  _sessionKey?: string,
  options: WebhookOptions = {}
): Promise<{ success: boolean; error?: string }> {
  const gatewayToken = options.gatewayToken ?? process.env.OPENCLAW_GATEWAY_TOKEN
  const timeout = options.timeout ?? 5000

  if (!gatewayToken) {
    console.error('[Webhook] No gateway token configured. Set OPENCLAW_GATEWAY_TOKEN env var.')
    return { success: false, error: 'No gateway token configured' }
  }

  const message = `Secret "${secretName}" was submitted. You may proceed.`

  try {
    const cmd = `openclaw system event --text "${message}" --token ${gatewayToken} --timeout 5000`
    
    execSync(cmd, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: timeout,
    })

    console.log(`[Webhook] Successfully triggered event for secret: ${secretName}`)
    return { success: true }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    console.error('[Webhook] Error firing event:', errorMessage)
    return { success: false, error: errorMessage }
  }
}

/**
 * Fire webhook to OpenClaw gateway with full payload
 * Used by POST /webhooks/secret-submitted endpoint
 */
export async function fireWebhookEvent(
  secretName: string,
  sessionKey?: string,
  options: WebhookOptions = {}
): Promise<{ success: boolean; error?: string }> {
  const gatewayToken = options.gatewayToken ?? process.env.OPENCLAW_GATEWAY_TOKEN
  const timeout = options.timeout ?? 5000

  if (!gatewayToken) {
    console.error('[Webhook] No gateway token configured. Set OPENCLAW_GATEWAY_TOKEN env var.')
    return { success: false, error: 'No gateway token configured' }
  }

  const sanitizedSessionKey = sanitizeSessionKey(sessionKey)
  const timestamp = new Date().toISOString()
  const message = `Secret ${secretName} was submitted. You may proceed.`

  // Build the webhook payload
  const payload: SecretSubmittedPayload = {
    event: 'clawvault.secret_submitted',
    name: secretName,
    timestamp,
    sessionKey: sanitizedSessionKey,
    message,
  }

  try {
    // Use openclaw system webhook command if available, otherwise use openclaw system event
    const cmd = `openclaw system webhook --token ${gatewayToken} --event-name clawvault.secret_submitted --data '${JSON.stringify(payload)}' --timeout 5`
    
    execSync(cmd, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: timeout,
    })

    console.log(`[Webhook] Successfully triggered webhook for secret: ${secretName}`)
    return { success: true }
  } catch {
    // Fallback: try system event as alternative
    try {
      const fallbackCmd = `openclaw system event --text "${message}" --token ${gatewayToken} --timeout 5`
      execSync(fallbackCmd, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: timeout,
      })
      console.log(`[Webhook] Successfully triggered event fallback for secret: ${secretName}`)
      return { success: true }
    } catch (fallbackErr) {
      const errorMessage = fallbackErr instanceof Error ? fallbackErr.message : 'Unknown error'
      console.error('[Webhook] Error firing webhook:', errorMessage)
      return { success: false, error: errorMessage }
    }
  }
}

export function generateWebhookToken(): string {
  return randomBytes(32).toString('hex')
}
