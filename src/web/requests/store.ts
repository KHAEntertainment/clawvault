import { randomBytes } from 'crypto'

export interface SecretRequest {
  id: string
  label?: string
  secretName: string
  createdAt: number
  expiresAt: number
  usedAt?: number
}

export interface RequestStoreOptions {
  ttlMs?: number
  cleanupIntervalMs?: number
}

interface Deferred<T> {
  promise: Promise<T>
  resolve: (v: T) => void
  reject: (e: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

export class SecretRequestStore {
  private requests = new Map<string, SecretRequest>()
  private waiters = new Map<string, Deferred<'fulfilled'>>()
  private ttlMs: number
  private cleanupIntervalMs: number
  private timer?: NodeJS.Timeout

  constructor(options: RequestStoreOptions = {}) {
    this.ttlMs = options.ttlMs ?? 15 * 60 * 1000
    this.cleanupIntervalMs = options.cleanupIntervalMs ?? 60 * 1000
  }

  startCleanup(): void {
    if (this.timer) return
    this.timer = setInterval(() => this.cleanup(), this.cleanupIntervalMs)
    // Allow process to exit if this is the only pending timer.
    this.timer.unref?.()
  }

  stopCleanup(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
  }

  create(secretName: string, label?: string): SecretRequest {
    const id = randomBytes(16).toString('hex')
    const now = Date.now()
    const req: SecretRequest = {
      id,
      label,
      secretName,
      createdAt: now,
      expiresAt: now + this.ttlMs,
    }
    this.requests.set(id, req)
    this.startCleanup()
    return req
  }

  get(id: string): SecretRequest | undefined {
    const req = this.requests.get(id)
    if (!req) return undefined
    if (this.isExpired(req)) return undefined
    return req
  }

  markUsed(id: string): SecretRequest | undefined {
    const req = this.requests.get(id)
    if (!req) return undefined
    req.usedAt = Date.now()
    this.requests.set(id, req)
    const w = this.waiters.get(id)
    if (w) {
      w.resolve('fulfilled')
      this.waiters.delete(id)
    }
    return req
  }

  isExpired(req: SecretRequest): boolean {
    return Date.now() > req.expiresAt
  }

  isUsed(req: SecretRequest): boolean {
    return typeof req.usedAt === 'number'
  }

  waitForFulfilled(id: string): Promise<'fulfilled'> {
    const req = this.requests.get(id)
    if (req && this.isUsed(req)) return Promise.resolve('fulfilled')
    let w = this.waiters.get(id)
    if (!w) {
      w = deferred<'fulfilled'>()
      this.waiters.set(id, w)
    }
    return w.promise
  }

  cleanup(): void {
    const now = Date.now()
    for (const [id, req] of this.requests.entries()) {
      if (req.usedAt) continue
      if (now > req.expiresAt) {
        this.requests.delete(id)
        const w = this.waiters.get(id)
        if (w) {
          w.reject(new Error('Request expired'))
          this.waiters.delete(id)
        }
      }
    }
  }
}
