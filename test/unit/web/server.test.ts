/**
 * Web Server Security Tests
 *
 * Verifies that the web server enforces auth, rate limiting,
 * CORS, and security headers.
 */

import { createServer, isLocalhostBinding } from '../../../src/web/index'
import { StorageProvider } from '../../../src/storage/interfaces'
import { SecretRequestStore } from '../../../src/web/requests/store'
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
    const requestStore = new SecretRequestStore({ ttlMs: 60000 })
    const app = await createServer(storage, { port: 0, host: 'localhost', requestStore }, DUMMY_AUTH)
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

  describe('Manage dashboard routes', () => {
    const SECRET_VALUE = 'my-super-secret-value-xyz'

    function formRequest(
      srv: http.Server,
      method: string,
      path: string,
      options?: { body?: string; headers?: Record<string, string> }
    ): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
      return new Promise((resolve, reject) => {
        const addr = srv.address() as { port: number }
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port: addr.port,
            path,
            method,
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
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

    beforeAll(async () => {
      // Pre-populate a secret so CSRF tokens appear in the manage page forms
      await storage.set('MANAGE_TEST_SECRET', SECRET_VALUE)
    })

    /** Extract CSRF token from the manage dashboard HTML. */
    async function getCsrfToken(): Promise<string> {
      const listRes = await request(server, 'GET', '/manage', { headers: authHeader() })
      const match = listRes.body.match(/name="_csrf"\s+value="([^"]+)"/)
      if (!match) throw new Error('CSRF token not found in manage page')
      return match[1]
    }

    it('should reject GET /manage without auth', async () => {
      const res = await request(server, 'GET', '/manage')
      expect(res.status).toBe(401)
    })

    it('should return manage dashboard HTML with auth', async () => {
      const res = await request(server, 'GET', '/manage', { headers: authHeader() })
      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toContain('text/html')
      expect(res.body).toContain('Secret Management Dashboard')
      // Secret values must NOT appear in the dashboard
      expect(res.body).not.toContain(SECRET_VALUE)
    })

    it('should serve /static/manage.js for the dashboard', async () => {
      const res = await request(server, 'GET', '/static/manage.js')
      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toContain('javascript')
    })

    it('should reject POST /manage/:name/update without auth', async () => {
      const res = await formRequest(server, 'POST', '/manage/MANAGE_TEST_SECRET/update', {
        body: '_csrf=token&secretValue=newvalue'
      })
      expect(res.status).toBe(401)
    })

    it('should reject POST /manage/:name/update with invalid CSRF token', async () => {
      const res = await formRequest(server, 'POST', '/manage/MANAGE_TEST_SECRET/update', {
        headers: { ...authHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
        body: '_csrf=wrongtoken&secretValue=newvalue'
      })
      expect(res.status).toBe(403)
      expect(res.body).toContain('Invalid CSRF token')
      // Secret value must not appear in response
      expect(res.body).not.toContain('newvalue')
    })

    it('should reject POST /manage/:name/update with invalid secret name', async () => {
      const csrfToken = await getCsrfToken()
      const res = await formRequest(server, 'POST', '/manage/invalid-name/update', {
        headers: { ...authHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `_csrf=${encodeURIComponent(csrfToken)}&secretValue=newvalue`
      })
      expect(res.status).toBe(400)
      expect(res.body).toContain('Invalid secret name format')
    })

    it('should reject POST /manage/:name/update with empty secret value', async () => {
      const csrfToken = await getCsrfToken()
      const res = await formRequest(server, 'POST', '/manage/MANAGE_TEST_SECRET/update', {
        headers: { ...authHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `_csrf=${encodeURIComponent(csrfToken)}&secretValue=`
      })
      expect(res.status).toBe(400)
      expect(res.body).toContain('Secret value cannot be empty')
    })

    it('should redirect to /manage?updated=... on successful update', async () => {
      const csrfToken = await getCsrfToken()
      const secretValue = 'supersecretvalue'
      const res = await formRequest(server, 'POST', '/manage/MANAGE_TEST_SECRET/update', {
        headers: { ...authHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `_csrf=${encodeURIComponent(csrfToken)}&secretValue=${encodeURIComponent(secretValue)}`
      })
      expect(res.status).toBe(303)
      expect(res.headers['location']).toBe('/manage?updated=MANAGE_TEST_SECRET')
      // Secret value must not appear in the redirect response
      expect(res.body).not.toContain(secretValue)
    })

    it('should show success banner when redirected with ?updated= param', async () => {
      const res = await request(server, 'GET', '/manage?updated=MANAGE_TEST_SECRET', { headers: authHeader() })
      expect(res.status).toBe(200)
      expect(res.body).toContain('MANAGE_TEST_SECRET')
      expect(res.body).toContain('updated successfully')
    })

    it('should not show success banner for invalid ?updated= param', async () => {
      const res = await request(server, 'GET', '/manage?updated=invalid-name', { headers: authHeader() })
      expect(res.status).toBe(200)
      expect(res.body).not.toContain('updated successfully')
    })
  })
})
