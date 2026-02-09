/**
 * Audit Storage Provider Tests
 *
 * Verifies that audit events contain metadata only (never secret values)
 * and that audit failures do not block storage operations.
 */

import { AuditedStorageProvider, AuditEvent } from '../../../src/storage/audit'
import { StorageProvider } from '../../../src/storage/interfaces'

class MemoryProvider implements StorageProvider {
  private store: Record<string, string> = {}

  async set(name: string, value: string): Promise<void> { this.store[name] = value }
  async get(name: string): Promise<string | null> { return this.store[name] ?? null }
  async delete(name: string): Promise<void> { delete this.store[name] }
  async list(): Promise<string[]> { return Object.keys(this.store) }
  async has(name: string): Promise<boolean> { return name in this.store }
}

describe('AuditedStorageProvider', () => {
  let events: AuditEvent[]
  let inner: StorageProvider
  let audited: AuditedStorageProvider

  beforeEach(() => {
    events = []
    inner = new MemoryProvider()
    audited = new AuditedStorageProvider(inner, (e) => events.push(e))
  })

  it('should emit set events with metadata only', async () => {
    await audited.set('MY_SECRET', 'super-secret-value-12345')

    expect(events).toHaveLength(1)
    expect(events[0].operation).toBe('set')
    expect(events[0].secretName).toBe('MY_SECRET')
    expect(events[0].success).toBe(true)

    // Verify no secret value leaked into the event
    const serialized = JSON.stringify(events[0])
    expect(serialized).not.toContain('super-secret-value-12345')
  })

  it('should emit get events without exposing retrieved value', async () => {
    await audited.set('MY_SECRET', 'the-actual-value')
    events = []

    const value = await audited.get('MY_SECRET')

    expect(value).toBe('the-actual-value')
    expect(events).toHaveLength(1)
    expect(events[0].operation).toBe('get')
    expect(events[0].secretName).toBe('MY_SECRET')

    const serialized = JSON.stringify(events[0])
    expect(serialized).not.toContain('the-actual-value')
  })

  it('should emit events for list and delete', async () => {
    await audited.set('A', 'v1')
    await audited.set('B', 'v2')
    events = []

    await audited.list()
    await audited.delete('A')
    await audited.has('B')

    expect(events).toHaveLength(3)
    expect(events[0].operation).toBe('list')
    expect(events[1].operation).toBe('delete')
    expect(events[1].secretName).toBe('A')
    expect(events[2].operation).toBe('has')
    expect(events[2].secretName).toBe('B')
  })

  it('should emit failure events with error message', async () => {
    const failingProvider: StorageProvider = {
      async set() { throw new Error('keyring locked') },
      async get() { throw new Error('keyring locked') },
      async delete() { throw new Error('keyring locked') },
      async list() { throw new Error('keyring locked') },
      async has() { throw new Error('keyring locked') }
    }

    const failAudited = new AuditedStorageProvider(failingProvider, (e) => events.push(e))

    await expect(failAudited.set('X', 'v')).rejects.toThrow('keyring locked')
    expect(events).toHaveLength(1)
    expect(events[0].success).toBe(false)
    expect(events[0].errorMessage).toBe('keyring locked')
  })

  it('should not block operations when audit handler throws', async () => {
    const throwingAudited = new AuditedStorageProvider(inner, () => {
      throw new Error('audit handler crashed')
    })

    // Storage operation should still succeed
    await throwingAudited.set('SAFE', 'value')
    const val = await throwingAudited.get('SAFE')
    expect(val).toBe('value')
  })
})
