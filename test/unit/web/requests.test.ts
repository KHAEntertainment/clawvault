import http from 'http'
import { createServer } from '../../../src/web/index'
import { StorageProvider } from '../../../src/storage/interfaces'
import { SecretRequestStore } from '../../../src/web/requests/store'

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
  options?: { body?: string; headers?: Record<string, string>; contentType?: string }
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
          'Content-Type': options?.contentType ?? 'application/json',
          ...options?.headers,
        },
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

describe('One-time secret requests', () => {
  const DUMMY_AUTH = 'x'.repeat(32)
  let server: http.Server
  let storage: StorageProvider
  let store: SecretRequestStore

  function authHeader(): Record<string, string> {
    return { 'Authorization': `Bearer ${DUMMY_AUTH}` }
  }

  beforeAll(async () => {
    storage = new MemoryProvider()
    store = new SecretRequestStore({ ttlMs: 200 })
    const app = await createServer(storage, { port: 0, host: 'localhost', requestStore: store }, DUMMY_AUTH)
    server = http.createServer(app)
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve())
    })
  })

  afterAll(async () => {
    store.stopCleanup()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it('creates a request via API and fulfills it once', async () => {
    const createRes = await request(server, 'POST', '/api/requests', {
      headers: authHeader(),
      body: JSON.stringify({ secretName: 'TEST_ONE', label: 'Test secret' }),
    })
    expect(createRes.status).toBe(200)
    const parsed = JSON.parse(createRes.body)
    expect(parsed.success).toBe(true)
    const id = parsed.request.id as string

    const getForm = await request(server, 'GET', `/requests/${id}`, { contentType: 'text/html' })
    expect(getForm.status).toBe(200)
    expect(getForm.body).toContain('Submit secret')

    const submitRes = await request(server, 'POST', `/requests/${id}/submit`, {
      contentType: 'application/x-www-form-urlencoded',
      body: 'secretValue=hello',
    })
    expect(submitRes.status).toBe(200)

    const v = await storage.get('TEST_ONE')
    expect(v).toBe('hello')

    const submitAgain = await request(server, 'POST', `/requests/${id}/submit`, {
      contentType: 'application/x-www-form-urlencoded',
      body: 'secretValue=world',
    })
    expect([410, 404]).toContain(submitAgain.status)
  })

  it('expires requests', async () => {
    const r = store.create('TEST_EXP')
    await new Promise(resolve => setTimeout(resolve, 250))

    const res = await request(server, 'GET', `/requests/${r.id}`, { contentType: 'text/html' })
    expect(res.status).toBe(404)
  })
})
