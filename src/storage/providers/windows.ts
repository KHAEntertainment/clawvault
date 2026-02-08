import { exec } from 'child_process'
import { promisify } from 'util'
import { StorageProvider } from '../interfaces.js'

const execAsync = promisify(exec)

/**
 * Target name used in Windows Credential Manager for all ClawVault secrets
 */
const TARGET = 'clawvault'

/**
 * Windows Credential Manager provider using cmdkey CLI
 *
 * Commands:
 * - Store: cmdkey /generic:clawvault /user:SECRET_NAME /pass:VALUE
 * - Get: PowerShell script to retrieve from Windows vault
 * - Delete: cmdkey /delete:clawvault /user:SECRET_NAME
 * - List: cmdkey /list:clawvault
 *
 * Note: Windows Credential Manager stores credentials with these attributes:
 * - /target:clawvault - identifies the ClawVault credential set
 * - /user:SECRET_NAME - the secret name (e.g., OPENAI_API_KEY)
 * - /pass:VALUE - the secret value
 */
export class WindowsCredentialManager implements StorageProvider {
  /**
   * Store a secret in Windows Credential Manager
   */
  async set(name: string, value: string): Promise<void> {
    // Escape special characters for Windows cmd
    const escapedValue = this.escapeValue(value)
    const escapedName = this.escapeValue(name)

    // Delete existing credential first (cmdkey doesn't have update)
    await this.delete(name)

    // Add new credential
    await execAsync(`cmdkey /generic:${TARGET} /user:"${escapedName}" /pass:"${escapedValue}"`)
  }

  /**
   * Retrieve a secret from Windows Credential Manager
   * INTERNAL USE ONLY - never expose to AI context
   *
   * Note: cmdkey cannot retrieve passwords directly.
   * We use PowerShell with Windows Credential Manager API.
   */
  async get(name: string): Promise<string | null> {
    try {
      // Use PowerShell to retrieve credential from Windows vault
      const psScript = `
        try {
          $cred = cmdkey /list:${TARGET} 2>$null | Select-String "Target: ${TARGET}" -Context 0,20
          if ($cred -match 'user: ${name}') {
            $lines = $cred -split '\\n'
            foreach ($line in $lines) {
              if ($line -match 'pass:\\s*(.+)') {
                Write-Output $matches[1].Trim()
                exit
              }
            }
          }
        } catch {
          Write-Output ""
        }
      `.replace(/\n/g, ' ').trim()

      const { stdout } = await execAsync(`powershell -Command "${psScript}"`)
      return stdout.trim() || null
    } catch {
      return null
    }
  }

  /**
   * Delete a secret from Windows Credential Manager
   */
  async delete(name: string): Promise<void> {
    try {
      await execAsync(`cmdkey /delete:${TARGET} /user:"${name}" 2>nul`)
    } catch {
      // Ignore errors if credential doesn't exist
    }
  }

  /**
   * List all ClawVault secrets from Windows Credential Manager
   * Parses cmdkey /list output
   */
  async list(): Promise<string[]> {
    try {
      const { stdout } = await execAsync(`cmdkey /list:${TARGET} 2>nul`)
      return this.parseCmdkeyList(stdout)
    } catch {
      return []
    }
  }

  /**
   * Check if a secret exists
   */
  async has(name: string): Promise<boolean> {
    const list = await this.list()
    return list.includes(name)
  }

  /**
   * Parse cmdkey list output to extract secret names
   * Format: "user: SECRET_NAME"
   */
  private parseCmdkeyList(output: string): string[] {
    const names: string[] = []
    const lines = output.split('\n')

    for (const line of lines) {
      // Match "user: SECRET_NAME" pattern
      const match = line.match(/user:\s*(.+)/i)
      if (match) {
        names.push(match[1].trim())
      }
    }

    return names
  }

  /**
   * Escape special characters for Windows cmd
   * Prevents command injection when storing secrets
   */
  private escapeValue(value: string): string {
    // Escape special characters for Windows cmd
    return value
      .replace(/"/g, '""')
      .replace(/%/g, '%%')
      .replace(/&/g, '^&')
      .replace(/\|/g, '^|')
      .replace(/</g, '^<')
      .replace(/>/g, '^>')
  }
}
