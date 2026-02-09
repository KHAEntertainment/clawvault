/**
 * Storage Audit Logger
 *
 * Wraps any StorageProvider with audit event emission. Every set/get/delete/list
 * operation emits a structured event to a configurable handler. Events contain
 * METADATA ONLY -- never secret values.
 *
 * For agents troubleshooting:
 * - The default handler writes to stderr as JSON lines.
 * - Custom handlers can forward to syslog, files, or external services.
 * - If audit logging fails, the underlying storage operation still completes
 *   (audit failure must not block secret access).
 * - Events include: timestamp, operation, secretName, success, errorMessage.
 */

import { StorageProvider } from './interfaces.js'

export interface AuditEvent {
  timestamp: string
  operation: 'set' | 'get' | 'delete' | 'list' | 'has'
  secretName?: string
  success: boolean
  errorMessage?: string
}

export type AuditHandler = (event: AuditEvent) => void

const defaultAuditHandler: AuditHandler = (event: AuditEvent) => {
  try {
    process.stderr.write(JSON.stringify(event) + '\n')
  } catch {
    // Never let audit logging crash the process
  }
}

export class AuditedStorageProvider implements StorageProvider {
  private readonly inner: StorageProvider
  private readonly handler: AuditHandler

  constructor(inner: StorageProvider, handler?: AuditHandler) {
    this.inner = inner
    this.handler = handler ?? defaultAuditHandler
  }

  private emit(event: AuditEvent): void {
    try {
      this.handler(event)
    } catch {
      // Audit failure must never block storage operations
    }
  }

  async set(name: string, value: string): Promise<void> {
    try {
      await this.inner.set(name, value)
      this.emit({ timestamp: new Date().toISOString(), operation: 'set', secretName: name, success: true })
    } catch (error: unknown) {
      this.emit({ timestamp: new Date().toISOString(), operation: 'set', secretName: name, success: false, errorMessage: error instanceof Error ? error.message : 'Unknown error' })
      throw error
    }
  }

  /** INTERNAL USE ONLY - never expose to AI context */
  async get(name: string): Promise<string | null> {
    try {
      const result = await this.inner.get(name)
      this.emit({ timestamp: new Date().toISOString(), operation: 'get', secretName: name, success: true })
      return result
    } catch (error: unknown) {
      this.emit({ timestamp: new Date().toISOString(), operation: 'get', secretName: name, success: false, errorMessage: error instanceof Error ? error.message : 'Unknown error' })
      throw error
    }
  }

  async delete(name: string): Promise<void> {
    try {
      await this.inner.delete(name)
      this.emit({ timestamp: new Date().toISOString(), operation: 'delete', secretName: name, success: true })
    } catch (error: unknown) {
      this.emit({ timestamp: new Date().toISOString(), operation: 'delete', secretName: name, success: false, errorMessage: error instanceof Error ? error.message : 'Unknown error' })
      throw error
    }
  }

  async list(): Promise<string[]> {
    try {
      const result = await this.inner.list()
      this.emit({ timestamp: new Date().toISOString(), operation: 'list', success: true })
      return result
    } catch (error: unknown) {
      this.emit({ timestamp: new Date().toISOString(), operation: 'list', success: false, errorMessage: error instanceof Error ? error.message : 'Unknown error' })
      throw error
    }
  }

  async has(name: string): Promise<boolean> {
    try {
      const result = await this.inner.has(name)
      this.emit({ timestamp: new Date().toISOString(), operation: 'has', secretName: name, success: true })
      return result
    } catch (error: unknown) {
      this.emit({ timestamp: new Date().toISOString(), operation: 'has', secretName: name, success: false, errorMessage: error instanceof Error ? error.message : 'Unknown error' })
      throw error
    }
  }
}
