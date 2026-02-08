import { exec } from 'child_process'
import { promisify } from 'util'
import { StorageProvider } from '../interfaces.js'

const execAsync = promisify(exec)

/**
 * Account name used in macOS Keychain for all ClawVault secrets
 */
const ACCOUNT = 'clawvault'

/**
 * macOS Keychain provider using security CLI
 *
 * Commands:
 * - Store: security add-generic-password -a clawvault -s SECRET_NAME -w VALUE
 * - Get: security find-generic-password -a clawvault -s SECRET_NAME -w
 * - Delete: security delete-generic-password -a clawvault -s SECRET_NAME
 * - List: security dump-keychain | grep -A 1 "acct"clawvault""
 */
export class MacOSKeychainProvider implements StorageProvider {
  /**
   * Store a secret in macOS Keychain
   */
  async set(name: string, value: string): Promise<void> {
    // Escape value to prevent command injection
    const escapedValue = this.escapeValue(value)
    const label = `ClawVault: ${name}`
    const cmd = `security add-generic-password -a "${ACCOUNT}" -s "${name}" -w "${escapedValue}" -D "${label}" -T /usr/bin/security 2>/dev/null`

    try {
      await execAsync(cmd)
    } catch (error) {
      // If item already exists, delete and re-add
      const { stderr } = error as { stderr: string }
      if (stderr && stderr.includes('duplicate')) {
        await this.delete(name)
        await execAsync(cmd)
      } else {
        throw error
      }
    }
  }

  /**
   * Retrieve a secret from macOS Keychain
   * INTERNAL USE ONLY - never expose to AI context
   */
  async get(name: string): Promise<string | null> {
    try {
      // The -w flag outputs only the password
      const { stdout } = await execAsync(
        `security find-generic-password -a "${ACCOUNT}" -s "${name}" -w 2>/dev/null`
      )
      return stdout.trim() || null
    } catch {
      return null
    }
  }

  /**
   * Delete a secret from macOS Keychain
   */
  async delete(name: string): Promise<void> {
    try {
      await execAsync(`security delete-generic-password -a "${ACCOUNT}" -s "${name}" 2>/dev/null`)
    } catch {
      // Ignore errors if item doesn't exist
    }
  }

  /**
   * List all ClawVault secrets from macOS Keychain
   * Uses dump-keychain output to find all entries with clawvault account
   */
  async list(): Promise<string[]> {
    try {
      // Dump keychain and parse for our entries
      const { stdout } = await execAsync(
        `security dump-keychain 2>/dev/null | grep -A 10 "acct\\"clawvault\\"" | grep "svce" | awk -F'"' '{print $4}'`
      )
      return this.parseListOutput(stdout)
    } catch {
      return []
    }
  }

  /**
   * Check if a secret exists
   */
  async has(name: string): Promise<boolean> {
    const val = await this.get(name)
    return val !== null
  }

  /**
   * Parse list output to extract secret names
   */
  private parseListOutput(output: string): string[] {
    if (!output || output === '') {
      return []
    }
    return output
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
  }

  /**
   * Escape shell special characters in secret values
   * Prevents command injection when storing secrets
   */
  private escapeValue(value: string): string {
    // Escape backslashes and double quotes for macOS security command
    return value
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\$/g, '\\$')
      .replace(/`/g, '\\`')
  }
}
