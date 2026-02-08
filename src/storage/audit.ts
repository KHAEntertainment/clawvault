import { join } from 'path'
import { homedir } from 'os'
import { promises as fs } from 'fs'

/**
 * Audit log entry - metadata only, NEVER secret values
 */
export interface AuditEntry {
  timestamp: string
  action: 'set' | 'get' | 'delete' | 'list'
  secretName: string
  success: boolean
  error?: string
  // NEVER include secret values - security critical
}

/**
 * Audit logger for security tracking
 *
 * Logs metadata only (what secret, when, by whom, success/failure).
 * NEVER logs secret values - this is security critical.
 */
export class AuditLogger {
  private logPath: string
  private initialized = false

  constructor() {
    this.logPath = join(homedir(), '.clawvault', 'audit.log')
  }

  /**
   * Initialize audit log directory
   */
  private async init(): Promise<void> {
    if (this.initialized) return

    try {
      await fs.mkdir(join(homedir(), '.clawvault'), { recursive: true })
      this.initialized = true
    } catch {
      // Continue without audit log if we can't create directory
      this.initialized = true
    }
  }

  /**
   * Write an audit entry to the log
   */
  async log(entry: AuditEntry): Promise<void> {
    await this.init()

    // Ensure no secret value is being logged (security check)
    const sanitizedEntry = this.sanitizeEntry(entry)

    try {
      const line = JSON.stringify(sanitizedEntry) + '\n'
      await fs.appendFile(this.logPath, line, { mode: 0o600 })
    } catch {
      // Fail silently - audit log failure shouldn't break operations
    }
  }

  /**
   * Log a set operation
   */
  async logSet(secretName: string, success: boolean, error?: string): Promise<void> {
    await this.log({
      timestamp: new Date().toISOString(),
      action: 'set',
      secretName,
      success,
      error
    })
  }

  /**
   * Log a get operation
   */
  async logGet(secretName: string, success: boolean, error?: string): Promise<void> {
    await this.log({
      timestamp: new Date().toISOString(),
      action: 'get',
      secretName,
      success,
      error
    })
  }

  /**
   * Log a delete operation
   */
  async logDelete(secretName: string, success: boolean, error?: string): Promise<void> {
    await this.log({
      timestamp: new Date().toISOString(),
      action: 'delete',
      secretName,
      success,
      error
    })
  }

  /**
   * Log a list operation
   */
  async logList(success: boolean, count?: number, error?: string): Promise<void> {
    await this.log({
      timestamp: new Date().toISOString(),
      action: 'list',
      secretName: `all${count !== undefined ? ` (${count} items)` : ''}`,
      success,
      error
    })
  }

  /**
   * Read recent audit entries
   */
  async readRecent(limit: number = 100): Promise<AuditEntry[]> {
    await this.init()

    try {
      const content = await fs.readFile(this.logPath, 'utf-8')
      const lines = content.trim().split('\n').filter(Boolean)

      // Get last N entries
      const recentLines = lines.slice(-limit)

      return recentLines.map(line => {
        try {
          return JSON.parse(line) as AuditEntry
        } catch {
          return null
        }
      }).filter((entry): entry is AuditEntry => entry !== null)
    } catch {
      return []
    }
  }

  /**
   * Sanitize entry to ensure no secret values leak
   * This is a security-critical function
   */
  private sanitizeEntry(entry: AuditEntry): AuditEntry {
    const sanitized = { ...entry }

    // Check for common value-related keys that shouldn't be in audit logs
    const forbiddenKeys = ['value', 'secret', 'password', 'token', 'key']

    for (const key of forbiddenKeys) {
      if (key in sanitized) {
        // Remove any potentially leaked values
        delete (sanitized as Record<string, unknown>)[key]
      }
    }

    return sanitized
  }
}
