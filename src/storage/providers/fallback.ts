import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'
import type { CipherGCM, DecipherGCM } from 'crypto'
import { promises as fs } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { StorageProvider } from '../interfaces.js'

/**
 * Fallback encrypted file storage provider
 *
 * WARNING: This is less secure than platform-native keyring storage.
 * Only used when no keyring tools are available (development environments).
 * Emits a prominent warning when instantiated.
 */
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

  /**
   * Emit prominent security warning
   */
  private emitWarning() {
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
   * Derive encryption key from machine-specific data
   */
  private async getEncryptionKey(): Promise<Buffer> {
    let salt: Buffer

    try {
      salt = await fs.readFile(this.saltPath)
    } catch {
      // Create new salt if none exists
      await fs.mkdir(join(homedir(), '.clawvault'), { recursive: true })
      salt = randomBytes(16)
      await fs.writeFile(this.saltPath, salt, { mode: 0o600 })
    }

    // Derive key from machine ID + user-specific data
    const machineId = process.env.USER || process.env.USERNAME || 'default'
    return scryptSync(machineId + 'clawvault-key', salt, 32)
  }

  /**
   * Decrypt data using AES-256-GCM
   */
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

  /**
   * Encrypt data using AES-256-GCM
   */
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

  /**
   * Read and decrypt the secrets store
   */
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

  /**
   * Encrypt and write the secrets store
   */
  private async writeStore(store: Record<string, string>): Promise<void> {
    const key = await this.getEncryptionKey()
    const plaintext = JSON.stringify(store)
    const encrypted = this.encrypt(plaintext, key)

    await fs.mkdir(join(homedir(), '.clawvault'), { recursive: true })
    await fs.writeFile(this.storagePath, encrypted, { mode: 0o600 })
  }

  /**
   * Store a secret (encrypted)
   */
  async set(name: string, value: string): Promise<void> {
    const store = await this.readStore()
    store[name] = value
    await this.writeStore(store)
  }

  /**
   * Retrieve a secret (INTERNAL USE ONLY)
   */
  async get(name: string): Promise<string | null> {
    const store = await this.readStore()
    return store[name] || null
  }

  /**
   * Delete a secret
   */
  async delete(name: string): Promise<void> {
    const store = await this.readStore()
    delete store[name]
    await this.writeStore(store)
  }

  /**
   * List all secret names
   */
  async list(): Promise<string[]> {
    const store = await this.readStore()
    return Object.keys(store)
  }

  /**
   * Check if a secret exists
   */
  async has(name: string): Promise<boolean> {
    const store = await this.readStore()
    return name in store
  }
}
