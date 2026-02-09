/**
 * macOS Keychain Provider
 *
 * Uses execFile with argument arrays to avoid shell injection.
 * The macOS `security` CLI supports all needed operations via direct arguments.
 *
 * Security model:
 * - All commands use execFile (no shell) with explicit argument arrays.
 * - Secret values are passed via stdin where possible (set), or retrieved
 *   via stdout (get). They are NEVER interpolated into command strings.
 * - Secret names are validated against a strict allowlist pattern.
 * - Timeout and buffer limits prevent resource exhaustion.
 *
 * Troubleshooting (for agents):
 * - "security: command not found" → macOS security CLI missing; should not
 *   happen on any standard macOS install. Fallback provider will be used.
 * - "duplicate" error on set → handled automatically (delete + re-add).
 * - get() returns null when item does not exist (not an error).
 * - list() uses `security dump-keychain` + manual parsing. The output format
 *   is stable across macOS versions but verbose; we extract "svce" fields
 *   that match our account name.
 */

import { execFile } from 'child_process'
import { StorageProvider } from '../interfaces.js'

const ACCOUNT = 'clawvault'
const EXEC_TIMEOUT_MS = 10_000
const EXEC_MAX_BUFFER_BYTES = 1 * 1024 * 1024

const SAFE_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/

function execFileAsync(
  file: string,
  args: string[]
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      { timeout: EXEC_TIMEOUT_MS, maxBuffer: EXEC_MAX_BUFFER_BYTES },
      (error, stdout, stderr) => {
        if (error) {
          reject(error)
          return
        }
        resolve({ stdout: String(stdout ?? ''), stderr: String(stderr ?? '') })
      }
    )
  })
}

export class MacOSKeychainProvider implements StorageProvider {
  private validateName(name: string): void {
    if (!SAFE_NAME_PATTERN.test(name)) {
      throw new Error(`Invalid secret name: ${name}`)
    }
  }

  /**
   * Store a secret in macOS Keychain.
   *
   * Uses `security add-generic-password` with the -w flag reading from stdin
   * would be ideal, but macOS security CLI does not support stdin for -w.
   * Instead we pass the value as a direct argument to execFile, which is safe
   * because execFile does NOT invoke a shell -- the value is passed as a
   * C-level argv entry and never interpreted by sh/bash.
   */
  async set(name: string, value: string): Promise<void> {
    this.validateName(name)
    const label = `ClawVault: ${name}`

    const args = [
      'add-generic-password',
      '-a', ACCOUNT,
      '-s', name,
      '-w', value,
      '-D', label,
      '-T', '/usr/bin/security',
      '-U'
    ]

    try {
      await execFileAsync('security', args)
    } catch (error: unknown) {
      const stderr = (error as { stderr?: string }).stderr ?? ''
      if (stderr.includes('duplicate')) {
        await this.delete(name)
        await execFileAsync('security', args)
      } else {
        throw new Error(`Failed to store secret in macOS Keychain`)
      }
    }
  }

  /**
   * Retrieve a secret from macOS Keychain.
   * INTERNAL USE ONLY - never expose to AI context.
   */
  async get(name: string): Promise<string | null> {
    this.validateName(name)
    try {
      const { stdout } = await execFileAsync('security', [
        'find-generic-password',
        '-a', ACCOUNT,
        '-s', name,
        '-w'
      ])
      return stdout.trim() || null
    } catch {
      return null
    }
  }

  /**
   * Delete a secret from macOS Keychain.
   */
  async delete(name: string): Promise<void> {
    this.validateName(name)
    try {
      await execFileAsync('security', [
        'delete-generic-password',
        '-a', ACCOUNT,
        '-s', name
      ])
    } catch {
      // Ignore errors if item doesn't exist
    }
  }

  /**
   * List all ClawVault secrets in macOS Keychain.
   *
   * `security dump-keychain` outputs all keychain items in a structured text
   * format. We parse for items with our account name and extract service names.
   * This avoids shell pipelines (grep/awk) that the old implementation used.
   */
  async list(): Promise<string[]> {
    try {
      const { stdout } = await execFileAsync('security', ['dump-keychain'])
      return this.parseDumpOutput(stdout)
    } catch {
      return []
    }
  }

  async has(name: string): Promise<boolean> {
    const val = await this.get(name)
    return val !== null
  }

  /**
   * Parse `security dump-keychain` output to find our secrets.
   *
   * Output format per entry:
   *   keychain: "/Users/.../login.keychain-db"
   *   version: 256
   *   class: "genp"
   *   attributes:
   *       ...
   *       "acct"<blob>="clawvault"
   *       ...
   *       "svce"<blob>="SECRET_NAME"
   *       ...
   *
   * We look for blocks containing our account, then extract the svce value.
   */
  private parseDumpOutput(output: string): string[] {
    const names: string[] = []
    if (!output) return names

    const entries = output.split('keychain:')
    for (const entry of entries) {
      const acctMatch = entry.match(/"acct"<blob>="([^"]*)"/)
      if (!acctMatch || acctMatch[1] !== ACCOUNT) continue

      const svceMatch = entry.match(/"svce"<blob>="([^"]*)"/)
      if (svceMatch && svceMatch[1]) {
        names.push(svceMatch[1])
      }
    }

    return names
  }
}
