import { detectPlatform } from './platform.js'
import { LinuxKeyringProvider } from './providers/linux.js'
import { SystemdCredsProvider } from './providers/systemd.js'
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
    case 'systemd':
      return new SystemdCredsProvider()
    case 'macos':
      return new MacOSKeychainProvider()
    case 'windows':
      return new WindowsCredentialManager()
    case 'fallback': {
      const allowFallback = process.env.CLAWVAULT_ALLOW_FALLBACK === '1'
      if (!allowFallback) {
        throw new Error(
          'No system-native credential store is available.\n' +
          'On Linux, install/configure Secret Service (secret-tool + a keyring daemon) or systemd-creds.\n' +
          'To explicitly allow encrypted-file fallback storage, set CLAWVAULT_ALLOW_FALLBACK=1.'
        )
      }
      return new FallbackProvider()
    }
    default: {
      const allowFallback = process.env.CLAWVAULT_ALLOW_FALLBACK === '1'
      if (allowFallback) return new FallbackProvider()
      throw new Error('Unable to determine a supported credential storage backend.')
    }
  }
}

// Re-export types and audit wrapper
export type { StorageProvider, PlatformInfo } from './interfaces.js'
export { detectPlatform } from './platform.js'
export { AuditedStorageProvider } from './audit.js'
export type { AuditEvent, AuditHandler } from './audit.js'
