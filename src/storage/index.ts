import { detectPlatform } from './platform.js'
import { LinuxKeyringProvider } from './providers/linux.js'
import { MacOSKeychainProvider } from './providers/macos.js'
import { WindowsCredentialManager } from './providers/windows.js'
import { FallbackProvider } from './providers/fallback.js'
import { StorageProvider } from './interfaces.js'

/**
 * Create a storage provider based on detected platform
 *
 * Auto-detects the platform and returns the appropriate provider:
 * - Linux: GNOME Keyring via secret-tool
 * - macOS: Keychain via security
 * - Windows: Credential Manager via cmdkey
 * - Fallback: Encrypted file storage with warning
 */
export async function createStorage(): Promise<StorageProvider> {
  const platform = await detectPlatform()

  switch (platform.provider) {
    case 'linux':
      return new LinuxKeyringProvider()
    case 'macos':
      return new MacOSKeychainProvider()
    case 'windows':
      return new WindowsCredentialManager()
    case 'fallback':
      return new FallbackProvider()
    default:
      return new FallbackProvider()
  }
}

// Re-export types and audit wrapper
export type { StorageProvider, PlatformInfo } from './interfaces.js'
export { detectPlatform } from './platform.js'
export { AuditedStorageProvider } from './audit.js'
export type { AuditEvent, AuditHandler } from './audit.js'
