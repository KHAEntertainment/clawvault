import { exec } from 'child_process'
import { promisify } from 'util'
import { PlatformInfo } from './interfaces.js'

const execAsync = promisify(exec)

/**
 * Detect the current platform and available keyring provider
 * Uses command existence checks rather than platform detection alone
 */
export async function detectPlatform(): Promise<PlatformInfo> {
  const platform = process.platform

  if (platform === 'linux') {
    try {
      await execAsync('command -v secret-tool')
      return { platform, hasKeyring: true, provider: 'linux' }
    } catch {
      return { platform, hasKeyring: false, provider: 'fallback' }
    }
  }

  if (platform === 'darwin') {
    try {
      await execAsync('command -v security')
      return { platform, hasKeyring: true, provider: 'macos' }
    } catch {
      return { platform, hasKeyring: false, provider: 'fallback' }
    }
  }

  if (platform === 'win32') {
    try {
      await execAsync('where cmdkey')
      return { platform, hasKeyring: true, provider: 'windows' }
    } catch {
      return { platform, hasKeyring: false, provider: 'fallback' }
    }
  }

  return { platform, hasKeyring: false, provider: 'fallback' }
}
