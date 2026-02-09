/**
 * SystemdCredsProvider
 *
 * Uses systemd-creds to encrypt/decrypt secrets at rest using host- or user-scoped keys.
 *
 * Design goal: provide a "system-native" secure secret store for headless Linux and
 * system services where Secret Service (GNOME Keyring/KWallet) is not available.
 *
 * SECURITY:
 * - Secret values are passed via stdin to avoid exposure in argv.
 * - We never log secret values.
 */

import { execFile } from 'child_process'
import { StorageProvider } from '../interfaces.js'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

export interface SystemdCredsOptions {
  /** Directory to store encrypted credential files */
  dir?: string
  /** systemd-creds --with-key=... (default auto) */
  withKey?: 'auto' | 'host' | 'tpm2' | 'host+tpm2' | 'null' | 'auto-initrd'
  /** Use user-scoped key (default true). Set false to use host key. */
  userScoped?: boolean
}

export class SystemdCredsProvider implements StorageProvider {
  private dir: string
  private withKey: NonNullable<SystemdCredsOptions['withKey']>
  private userScoped: boolean
  private setupComplete = false
  private readonly safeNamePattern = /^[A-Z][A-Z0-9_]*$/

  constructor(options: SystemdCredsOptions = {}) {
    const dataHome = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share')
    this.dir = options.dir || path.join(dataHome, 'clawvault', 'systemd-creds')
    this.withKey = options.withKey || 'auto'
    this.userScoped = options.userScoped ?? true
  }

  private validateName(name: string): void {
    if (!this.safeNamePattern.test(name)) {
      throw new Error(`Invalid secret name: ${name}`)
    }
  }

  async set(name: string, value: string): Promise<void> {
    this.validateName(name)
    await this.ensureDir()
    await this.ensureSetup()

    const outPath = this.credPath(name)

    // Encrypt from stdin to output file.
    // Note: systemd-creds encrypt INPUT OUTPUT, where INPUT can be '-' for stdin.
    await this.execCreds(
      ['encrypt', '--with-key', this.withKey, ...(this.userScoped ? ['--user'] : []), '-', outPath],
      value
    )
  }

  async get(name: string): Promise<string | null> {
    this.validateName(name)
    const inPath = this.credPath(name)

    try {
      const { stdout } = await this.execCreds(
        ['decrypt', ...(this.userScoped ? ['--user'] : []), inPath],
        undefined
      )
      return stdout.toString()
    } catch (err: any) {
      const stderr = (err?.stderr ?? '').toString()
      // systemd-creds returns non-zero if file missing/unreadable
      if (stderr.toLowerCase().includes('no such file')) {
        return null
      }
      throw sanitizeError(err)
    }
  }

  async delete(name: string): Promise<void> {
    this.validateName(name)
    const p = this.credPath(name)
    try {
      await fs.unlink(p)
    } catch (err: any) {
      if (err?.code === 'ENOENT') return
      throw err
    }
  }

  async list(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.dir)
      return files
        .filter(f => f.endsWith('.cred'))
        .map(f => f.slice(0, -'.cred'.length))
        .filter(n => {
          try {
            this.validateName(n)
            return true
          } catch {
            return false
          }
        })
        .sort()
    } catch (err: any) {
      if (err?.code === 'ENOENT') return []
      throw err
    }
  }

  async has(name: string): Promise<boolean> {
    this.validateName(name)
    try {
      await fs.access(this.credPath(name))
      return true
    } catch {
      return false
    }
  }

  private credPath(name: string): string {
    return path.join(this.dir, `${name}.cred`)
  }

  private async ensureDir(create: boolean = true): Promise<void> {
    if (!create) return
    await fs.mkdir(this.dir, { recursive: true, mode: 0o700 })
  }

  private async ensureSetup(): Promise<void> {
    if (this.setupComplete) return
    try {
      await this.execCreds(['setup', ...(this.userScoped ? ['--user'] : [])])
    } catch {
      // Ignore setup failures; encryption may still work if keys already exist.
    }
    this.setupComplete = true
  }

  private execCreds(args: string[], stdin?: string): Promise<{ stdout: Buffer; stderr: Buffer }> {
    return new Promise((resolve, reject) => {
      const child = execFile(
        'systemd-creds',
        args,
        { timeout: 10_000, maxBuffer: 10 * 1024 * 1024 },
        (error, stdout, stderr) => {
          if (error) {
            ;(error as any).stdout = stdout
            ;(error as any).stderr = stderr
            reject(error)
            return
          }
          resolve({ stdout: Buffer.from(String(stdout ?? '')), stderr: Buffer.from(String(stderr ?? '')) })
        }
      )

      if (stdin !== undefined) {
        if (!child.stdin) {
          child.kill()
          reject(new Error('stdin unavailable for systemd-creds'))
          return
        }
        child.stdin.write(stdin)
        child.stdin.end()
      }
    })
  }
}

function sanitizeError(err: any): Error {
  // Ensure we don't accidentally bubble secret values (should never be present)
  // but also keep messages concise.
  const message = (err?.stderr ?? err?.message ?? 'systemd-creds error').toString()
  return new Error(message)
}
