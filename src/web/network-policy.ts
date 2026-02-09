import net from 'net'

const LOCALHOST_ADDRESSES = new Set(['localhost', '127.0.0.1', '::1'])

/** Returns true if binding is strictly local-only. */
export function isLocalhostBinding(host: string): boolean {
  return LOCALHOST_ADDRESSES.has(host)
}

/** Returns true if the host is clearly Tailscale-associated. No network calls. */
export function isTailscaleHost(host: string): boolean {
  const lower = host.toLowerCase()
  if (lower.endsWith('.ts.net')) return true

  const ipVersion = net.isIP(host)
  if (!ipVersion) return false
  if (ipVersion !== 4) return false

  // Tailscale CGNAT range: 100.64.0.0/10
  const parts = host.split('.').map(p => Number(p))
  if (parts.length !== 4 || parts.some(n => Number.isNaN(n) || n < 0 || n > 255)) return false

  const [a, b] = parts
  // 100.64.0.0 - 100.127.255.255
  return a === 100 && b >= 64 && b <= 127
}

export interface InsecureHttpPolicy {
  allow: boolean
  reason: 'localhost' | 'tailscale' | 'override' | 'refuse'
}

/**
 * Decide whether to allow starting an HTTP (non-TLS) server on the given host.
 */
export function decideInsecureHttpPolicy(host: string, allowOverride: boolean): InsecureHttpPolicy {
  if (isLocalhostBinding(host)) return { allow: true, reason: 'localhost' }
  if (isTailscaleHost(host)) return { allow: true, reason: 'tailscale' }
  if (allowOverride) return { allow: true, reason: 'override' }
  return { allow: false, reason: 'refuse' }
}
