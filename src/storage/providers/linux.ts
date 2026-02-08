import { exec } from 'child_process'
import { StorageProvider } from '../interfaces.js'

/**
 * Service name used in GNOME Keyring for all ClawVault secrets
 */
const SERVICE = 'clawvault'


function execCommand(command: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(error)
        return
      }
      resolve({ stdout, stderr })
    })
  })
}

/**
 * Linux GNOME Keyring provider using secret-tool CLI
 *
 * Commands match the pattern from reference-secret-manager.sh:
 * - Store: echo -n "$VALUE" | secret-tool store --label="$LABEL" service "$SERVICE" key "$KEY_NAME"
 * - Get: secret-tool lookup service "$SERVICE" key "$KEY_NAME" 2>/dev/null
 * - Delete: secret-tool remove service "$SERVICE" key "$KEY_NAME"
 */
export class LinuxKeyringProvider implements StorageProvider {
  private readonly safeNamePattern = /^[A-Z][A-Z0-9_]*$/

  private validateName(name: string): void {
    if (!this.safeNamePattern.test(name)) {
      throw new Error(`Invalid secret name: ${name}`)
    }
  }

  /**
   * Store a secret in GNOME Keyring
   */
  async set(name: string, value: string): Promise<void> {
    this.validateName(name)
    const label = `ClawVault: ${name}`
    // Use echo -n to avoid trailing newline, pipe to secret-tool store
    const cmd = `echo -n "${this.escapeValue(value)}" | secret-tool store --label="${label}" service "${SERVICE}" key "${name}"`
    await execCommand(cmd)
  }

  /**
   * Retrieve a secret from GNOME Keyring
   * INTERNAL USE ONLY - never expose to AI context
   */
  async get(name: string): Promise<string | null> {
    this.validateName(name)
    try {
      const { stdout } = await execCommand(
        `secret-tool lookup service "${SERVICE}" key "${name}" 2>/dev/null`
      )
      return stdout.trim() || null
    } catch {
      return null
    }
  }

  /**
   * Delete a secret from GNOME Keyring
   */
  async delete(name: string): Promise<void> {
    this.validateName(name)
    await execCommand(`secret-tool remove service "${SERVICE}" key "${name}"`)
  }

  /**
   * List all ClawVault secrets from GNOME Keyring
   * Uses gdbus to query the secrets service
   */
  async list(): Promise<string[]> {
    try {
      // Use gdbus to search for items with our service attribute
      const { stdout } = await execCommand(
        `gdbus call --session --dest org.freedesktop.secrets ` +
          `--object-path /org/freedesktop/secrets/collections/login ` +
          `--method org.freedesktop.Secret.Service.SearchItems ` +
          `"{'service': <'${SERVICE}'>}" 2>/dev/null || true`
      )
      return this.parseGdbusOutput(stdout)
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
   * Parse gdbus output to extract secret names
   * gdbus returns tuples like: ({'key': <'SECRET_NAME'>}, ...)
   */
  private parseGdbusOutput(output: string): string[] {
    const names: string[] = []
    if (!output || output === '') {
      return names
    }

    // Parse gdbus output format: ({'key': <'NAME'>}, ...)
    // Look for key patterns between single quotes after 'key': <
    const keyPattern = /'key':\s*<\s*'([^']+)'>/g
    let match
    while ((match = keyPattern.exec(output)) !== null) {
      names.push(match[1])
    }

    return names
  }

  /**
   * Escape shell special characters in secret values
   * Prevents command injection when storing secrets
   */
  private escapeValue(value: string): string {
    // Escape backslashes, double quotes, and backticks
    return value
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/`/g, '\\`')
      .replace(/\$/g, '\\$')
  }
}
