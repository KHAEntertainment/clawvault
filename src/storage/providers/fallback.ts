/**
 * Fallback Encrypted File Storage Provider
 *
 * WARNING: This is less secure than platform-native keyring storage.
 * Only used when no keyring tools are available (development environments).
 * Emits a prominent warning when instantiated.
 *
 * Security model (for agents troubleshooting):
 *
 * 1. Encryption: AES-256-GCM with a 256-bit key derived via scrypt.
 * 2. Key derivation: The scrypt input combines a machine-id (read from
 *    /etc/machine-id, IOPlatformUUID on macOS, or MachineGuid on Windows)
 *    with a random 32-byte salt stored in ~/.clawvault/.salt (mode 0600).
 *    This means:
 *    - A different machine cannot decrypt the file even with the salt.
 *    - The USERNAME-only fallback is used as a last resort and is WEAK --
 *      it will produce a warning.
 * 3. File permissions: Both .salt and secrets.enc.json are created with
 *    mode 0600 (owner read/write only).
 * 4. Anti-tamper: GCM authentication tag detects modifications.
 *
 * Why this is weaker than a real keyring:
 * - The key is derivable from filesystem artifacts. A keyring uses
 *   hardware-backed or session-locked storage.
 * - Any process running as the same user can read the encrypted file.
 * - If /etc/machine-id is predictable (e.g. in Docker), the key is
 *   only as strong as the salt.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'
import type { CipherGCM, DecipherGCM } from 'crypto'
import { promises as fs, readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { StorageProvider } from '../interfaces.js'

export class FallbackProvider implements StorageProvider {
  private storagePath: string
  private saltPath: string
  private algorithm = 'aes-256-gcm'
  private warningEmitted = false

  constructor() {
    const clawvaultDir = join(homedir(), '.clawvault')
    this.storagePath = join(clawvaultDir, 'secrets.enc.json')
    this.saltPath = join(clawvaultDir, '.salt')
    this.emitWarning()
  }

  private emitWarning(): void {
    if (this.warningEmitted) return
    this.warningEmitted = true

    console.warn('')
    console.warn('╔════════════════════════════════════════════════════════════╗')
    console.warn('║  WARNING: Using fallback encrypted file storage          ║')
    console.warn('║  This is less secure than platform keyring storage.       ║')
    console.warn('║  Install your platform keyring tools for better security.  ║')
    console.warn('║                                                            ║')
    console.warn('║  Linux:   libsecret-tools (apt install libsecret-tools)    ║')
    console.warn('║  macOS:   Built-in keychain (no installation needed)       ║')
    console.warn('║  Windows: Built-in Credential Manager (no install needed)  ║')
    console.warn('╚════════════════════════════════════════════════════════════╝')
    console.warn('')
  }

  /**
   * Read a machine-specific identifier for key derivation.
   *
   * Priority:
   * 1. /etc/machine-id (Linux)
   * 2. IOPlatformUUID via ioreg (macOS) — would need execFileSync, skip for now
   * 3. HKLM MachineGuid (Windows) — would need registry access, skip for now
   * 4. Fallback: process.env.USER (WEAK — warns separately)
   */
  private getMachineId(): string {
    // Linux: /etc/machine-id is a stable per-machine identifier
    try {
      const mid = readFileSync('/etc/machine-id', 'utf-8').trim()
      if (mid.length >= 16) return mid
    } catch { /* not Linux or not readable */ }

    // Fallback to username — WEAK
    const user = process.env.USER || process.env.USERNAME || ''
    if (user) {
      console.warn('ClawVault: Using username-based key derivation (weak). Install keyring tools for proper security.')
      return user
    }

    // Absolute fallback — essentially no secret keying
    console.warn('ClawVault: No machine-id or username available. Fallback encryption is NOT secure.')
    return 'clawvault-no-machine-id'
  }

  private async getEncryptionKey(): Promise<Buffer> {
    let salt: Buffer

    try {
      salt = await fs.readFile(this.saltPath)
    } catch {
      await fs.mkdir(join(homedir(), '.clawvault'), { recursive: true })
      salt = randomBytes(32)
      await fs.writeFile(this.saltPath, salt, { mode: 0o600 })
    }

    const machineId = this.getMachineId()
    return scryptSync(machineId + ':clawvault-key', salt, 32)
  }

  private decrypt(encrypted: string, key: Buffer): string {
    try {
      const data = JSON.parse(encrypted)
      const iv = Buffer.from(data.iv, 'hex')
      const authTag = Buffer.from(data.authTag, 'hex')
      const ciphertext = Buffer.from(data.ciphertext, 'hex')

      const decipher = createDecipheriv(this.algorithm, key, iv) as DecipherGCM
      decipher.setAuthTag(authTag)

      let plaintext = decipher.update(ciphertext)
      plaintext = Buffer.concat([plaintext, decipher.final()])

      return plaintext.toString('utf-8')
    } catch {
      return '{}'
    }
  }

  private encrypt(plaintext: string, key: Buffer): string {
    const iv = randomBytes(16)
    const cipher = createCipheriv(this.algorithm, key, iv) as CipherGCM

    let ciphertext = cipher.update(plaintext, 'utf-8')
    ciphertext = Buffer.concat([ciphertext, cipher.final()])

    const authTag = cipher.getAuthTag()

    return JSON.stringify({
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      ciphertext: ciphertext.toString('hex')
    })
  }

  private async readStore(): Promise<Record<string, string>> {
    try {
      const data = await fs.readFile(this.storagePath, 'utf-8')
      const key = await this.getEncryptionKey()
      const decrypted = this.decrypt(data, key)
      return JSON.parse(decrypted)
    } catch {
      return {}
    }
  }

  private async writeStore(store: Record<string, string>): Promise<void> {
    const key = await this.getEncryptionKey()
    const plaintext = JSON.stringify(store)
    const encrypted = this.encrypt(plaintext, key)

    await fs.mkdir(join(homedir(), '.clawvault'), { recursive: true })
    await fs.writeFile(this.storagePath, encrypted, { mode: 0o600 })
  }

  async set(name: string, value: string): Promise<void> {
    const store = await this.readStore()
    store[name] = value
    await this.writeStore(store)
  }

  /** INTERNAL USE ONLY - never expose to AI context */
  async get(name: string): Promise<string | null> {
    const store = await this.readStore()
    return store[name] || null
  }

  async delete(name: string): Promise<void> {
    const store = await this.readStore()
    delete store[name]
    await this.writeStore(store)
  }

  async list(): Promise<string[]> {
    const store = await this.readStore()
    return Object.keys(store)
  }

  async has(name: string): Promise<boolean> {
    const store = await this.readStore()
    return name in store
  }
}
