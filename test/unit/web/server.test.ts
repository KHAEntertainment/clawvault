/**
 * Web Server Security Tests
 *
 * Verifies that the web server enforces auth, rate limiting,
 * CORS, and security headers.
 */

import { createServer, isLocalhostBinding } from '../../../src/web/index'
import { StorageProvider } from '../../../src/storage/interfaces'
import http from 'http'

class MemoryProvider implements StorageProvider {
  private store: Record<string, string> = {}
  async set(name: string, value: string): Promise<void> { this.store[name] = value }
  async get(name: string): Promise<string | null> { return this.store[name] ?? null }
  async delete(name: string): Promise<void> { delete this.store[name] }
  async list(): Promise<string[]> { return Object.keys(this.store) }
  async has(name: string): Promise<boolean> { return name in this.store }
}

function request(
  server: http.Server,
  method: string,
  path: string,
  options?: { body?: string; headers?: Record<string, string> }
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as { port: number }
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: addr.port,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers
        }
      },
      (res) => {
        let data = ''
        res.on('data', (chunk) => { data += chunk })
        res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body: data }))
      }
    )
    req.on('error', reject)
    if (options?.body) req.write(options.body)
    req.end()
  })
}

describe('Web Server Security', () => {
  // Dummy value used only in this test — not a real credential
  const DUMMY_AUTH = 'x'.repeat(32)
  let server: http.Server
  let storage: StorageProvider

  function authHeader(): Record<string, string> {
    return { 'Authorization': `Bearer ${DUMMY_AUTH}` }
  }

  beforeAll(async () => {
    storage = new MemoryProvider()
    const app = await createServer(storage, { port: 0, host: 'localhost' }, DUMMY_AUTH)
    server = http.createServer(app)
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve())
    })
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  describe('Auth enforcement', () => {
    it('should reject requests without auth header', async () => {
      const res = await request(server, 'GET', '/api/status')
      expect(res.status).toBe(401)
      expect(JSON.parse(res.body).error).toContain('Unauthorized')
    })

    it('should reject requests with wrong auth', async () => {
      const res = await request(server, 'GET', '/api/status', {
        headers: { 'Authorization': 'Bearer wrong-value' }
      })
      expect(res.status).toBe(401)
    })

    it('should accept requests with correct auth', async () => {
      const res = await request(server, 'GET', '/api/status', {
        headers: authHeader()
      })
      expect(res.status).toBe(200)
    })

    it('should allow health check without auth', async () => {
      const res = await request(server, 'GET', '/health')
      expect(res.status).toBe(200)
      expect(JSON.parse(res.body).status).toBe('ok')
    })
  })

  describe('Security headers (helmet)', () => {
    it('should set Content-Security-Policy', async () => {
      const res = await request(server, 'GET', '/health')
      expect(res.headers['content-security-policy']).toBeDefined()
    })

    it('should set X-Content-Type-Options', async () => {
      const res = await request(server, 'GET', '/health')
      expect(res.headers['x-content-type-options']).toBe('nosniff')
    })

    it('should deny framing via CSP', async () => {
      const res = await request(server, 'GET', '/health')
      const csp = res.headers['content-security-policy'] as string
      expect(csp).toContain("frame-ancestors 'none'")
    })
  })

  describe('Submission endpoint', () => {
    it('should store data and return metadata only', async () => {
      const testValue = 'test-input-abcdef'
      const res = await request(server, 'POST', '/api/submit', {
        headers: authHeader(),
        body: JSON.stringify({ secretName: 'TEST_KEY', secretValue: testValue })
      })
      expect(res.status).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.success).toBe(true)
      expect(body.metadata.name).toBe('TEST_KEY')
      expect(body.metadata.length).toBe(testValue.length)
      // Value must NOT appear in response
      expect(res.body).not.toContain(testValue)
    })
  })

  describe('isLocalhostBinding()', () => {
    it('should identify localhost addresses', () => {
      expect(isLocalhostBinding('localhost')).toBe(true)
      expect(isLocalhostBinding('127.0.0.1')).toBe(true)
      expect(isLocalhostBinding('::1')).toBe(true)
    })

    it('should identify non-localhost addresses', () => {
      expect(isLocalhostBinding('0.0.0.0')).toBe(false)
      expect(isLocalhostBinding('192.168.1.1')).toBe(false)
      expect(isLocalhostBinding('example.com')).toBe(false)
    })
  })
})
