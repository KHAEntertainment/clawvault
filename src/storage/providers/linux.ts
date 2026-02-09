import { execFile } from 'child_process'
import { StorageProvider } from '../interfaces.js'
/**
 * Service name used in GNOME Keyring for all ClawVault secrets
 */
const SERVICE = 'clawvault'

const EXEC_TIMEOUT_MS = 10_000
const EXEC_MAX_BUFFER_BYTES = 1 * 1024 * 1024

function execFileCommand(file: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
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

/**
 * Linux GNOME Keyring provider using secret-tool CLI
 *
 * Uses execFile where possible to avoid shell parsing of untrusted input.
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

    await new Promise<void>((resolve, reject) => {
      const child = execFile(
        'secret-tool',
        ['store', `--label=${label}`, 'service', SERVICE, 'key', name],
        { timeout: EXEC_TIMEOUT_MS, maxBuffer: EXEC_MAX_BUFFER_BYTES },
        (error) => {
          if (error) {
            reject(error)
            return
          }
          resolve()
        }
      )

      if (child.stdin) {
        child.stdin.write(value)
        child.stdin.end()
      }
    })
  }

  /**
   * Retrieve a secret from GNOME Keyring
   * INTERNAL USE ONLY - never expose to AI context
   */
  async get(name: string): Promise<string | null> {
    this.validateName(name)
    try {
      const { stdout } = await execFileCommand('secret-tool', [
        'lookup',
        'service',
        SERVICE,
        'key',
        name
      ])
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
    await execFileCommand('secret-tool', ['remove', 'service', SERVICE, 'key', name])
  }

  /**
   * List all ClawVault secrets from GNOME Keyring
   * Uses gdbus to query the secrets service
   */
  async list(): Promise<string[]> {
    try {
      const { stdout } = await execFileCommand('gdbus', [
        'call',
        '--session',
        '--dest',
        'org.freedesktop.secrets',
        '--object-path',
        '/org/freedesktop/secrets',
        '--method',
        'org.freedesktop.Secret.Service.SearchItems',
        `{'service': <'${SERVICE}'>}`
      ])
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

    const keyPattern = /'key':\s*<\s*'([^']+)'\s*>/g
    let match
    while ((match = keyPattern.exec(output)) !== null) {
      names.push(match[1])
    }

    return names
  }
}
