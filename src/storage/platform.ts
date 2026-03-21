import { execFile } from 'child_process'
import { promisify } from 'util'
import { PlatformInfo } from './interfaces.js'

const execFileAsync = promisify(execFile)

/**
 * Get storage provider override from environment variable or CLI flags.
 * Priority: CLI flag > environment variable > auto-detection.
 *
 * @returns Provider type ('linux' | 'keychain' | 'credential' | 'systemd' | 'fallback') or null
 */
function getStorageOverride(): string | null {
  // 1. Check CLI flags first (highest priority)
  // CLI flags would be checked in command files when they use storage
  // For now, check environment variable as the primary override mechanism
  
  const envOverride = process.env.CLAWVAULT_STORAGE
  if (envOverride) {
    const validProviders = ['keyring', 'keychain', 'credential', 'systemd', 'fallback']
    if (validProviders.includes(envOverride)) {
      return envOverride
    }
  }
  
  return null
}

/**
 * Detect the current platform and available keyring provider.
 *
 * IMPORTANT: On Linux, "secret-tool" may exist but still be unusable in headless
 * environments (no D-Bus session bus). In that case we should fall back to the
 * encrypted-file provider rather than hard-fail at runtime.
 */
import { execFile } from 'child_process'
import { promisify } from 'util'
import { PlatformInfo } from './interfaces.js'

const execFileAsync = promisify(execFile)

/**
 * Get storage provider override from environment variable.
 *
 * Priority: CLAWVAULT_STORAGE environment variable > auto-detection.
 *
 * @returns Provider type string or null
 */
function getStorageOverride(): string | null {
  const envOverride = process.env.CLAWVAULT_STORAGE
  
  const validProviders = ['keyring', 'keychain', 'credential', 'systemd', 'fallback']
  if (envOverride && validProviders.includes(envOverride)) {
    return envOverride
  }
  
  return null
}

/**
 * Map storage type string to provider info.
 * Returns null for auto-detection (no override).
 */
function getProviderInfo(
  override: string | null,
  platform: NodeJS.Platform
): PlatformInfo | null {
  // If override is specified, return matching platform info
  if (override) {
    const providerMap: Record<string, { platform: NodeJS.Platform; hasKeyring: boolean; provider: 'linux' | 'systemd' | 'macos' | 'windows' | 'fallback' }> = {
      keyring: { platform: 'linux', hasKeyring: true, provider: 'linux' },
      keychain: { platform: 'darwin', hasKeyring: true, provider: 'macos' },
      credential: { platform: 'win32', hasKeyring: true, provider: 'windows' },
      systemd: { platform: 'linux', hasKeyring: true, provider: 'systemd' },
      fallback: { platform: 'linux', hasKeyring: false, provider: 'fallback' },
    }
    
    return providerMap[override] || null
  }
  
  return null
}

import { execFile } from 'child_process'
import { promisify } from 'util'
import { PlatformInfo } from './interfaces.js'

const execFileAsync = promisify(execFile)

/**
 * Get storage provider override from environment variable.
 *
 * Priority: CLAWVAULT_STORAGE environment variable > auto-detection.
 *
 * @returns Provider type string or null
 */
function getStorageOverride(): string | null {
  const envOverride = process.env.CLAWVAULT_STORAGE
  
  const validProviders = ['keyring', 'keychain', 'credential', 'systemd', 'fallback']
  if (envOverride && validProviders.includes(envOverride)) {
    return envOverride
  }
  
  return null
}

  if (platform === 'linux') {
    const hasSecretTool = await commandExists('secret-tool')
    if (hasSecretTool) {
      const usable = await linuxSecretToolUsable()
      if (usable) return { platform, hasKeyring: true, provider: 'linux' }
    }
    
    const hasSystemdCreds = await commandExists('systemd-creds')
    if (hasSystemdCreds) return { platform, hasKeyring: true, provider: 'systemd' }
    
    return { platform, hasKeyring: false, provider: 'fallback' }
  }

  if (platform === 'darwin') {
    const hasSecurity = await commandExists('security')
    
    const providerInfo = getProviderInfo(storageOverride, platform)
    if (providerInfo) {
      return providerInfo
    }
    
    return {
      platform,
      hasKeyring: hasSecurity,
      provider: hasSecurity ? 'macos' : 'fallback',
    }
  }

  if (platform === 'win32') {
    const hasCmdKey = await commandExistsWindows('cmdkey')
    
    const providerInfo = getProviderInfo(storageOverride, platform)
    if (providerInfo) {
      return providerInfo
    }
    
    return {
      platform,
      hasKeyring: hasCmdKey,
      provider: hasCmdKey ? 'windows' : 'fallback',
    }
  }

  return { platform, hasKeyring: false, provider: 'fallback' }
}
      
      const provider = providerMap[storageOverride] || 'linux'
      return { platform, hasKeyring: true, provider }
    }
    
    const usable = await linuxSecretToolUsable()
    if (usable) return { platform, hasKeyring: true, provider: 'linux' }
    
    // Headless/system-service Linux: prefer systemd credentials if available.
    const hasSystemdCreds = await commandExists('systemd-creds')
    if (hasSystemdCreds) return { platform, hasKeyring: true, provider: 'systemd' }
    
    return { platform, hasKeyring: false, provider: 'fallback' }
  }

  if (platform === 'darwin') {
    const hasSecurity = await commandExists('security')
    
    // Check if override forces specific provider
    if (storageOverride) {
      const providerMap: Record<string, 'keychain'> = {
        keyring: 'macos',
        keychain: 'macos', // Force keychain
        credential: 'macos', // Force credential on macOS
        systemd: 'macos',
        fallback: 'macos',
      }
      
      const provider = providerMap[storageOverride] || 'macos'
      return { platform, hasKeyring: hasSecurity, provider }
    }
    
    return {
      platform,
      hasKeyring: hasSecurity,
      provider: hasSecurity ? 'macos' : 'fallback',
    }
  }

  if (platform === 'win32') {
    // "where" is a built-in on Windows; execute via cmd.exe.
    const hasCmdKey = await commandExistsWindows('cmdkey')
    
    // Check if override forces specific provider
    if (storageOverride) {
      const providerMap: Record<string, 'credential'> = {
        keyring: 'windows',
        keychain: 'windows',
        credential: 'windows', // Force credential
        systemd: 'windows',
        fallback: 'windows',
      }
      
      const provider = providerMap[storageOverride] || 'windows'
      return { platform, hasKeyring: hasCmdKey, provider }
    }
    
    return {
      platform,
      hasKeyring: hasCmdKey,
      provider: hasCmdKey ? 'windows' : 'fallback',
    }
  }

  return { platform, hasKeyring: false, provider: 'fallback' }
}

async function commandExists(cmd: string): Promise<boolean> {
  try {
    await execFileAsync('sh', ['-lc', `command -v ${cmd}`], { timeout: 5_000 })
    return true
  } catch {
    return false
  }
}

async function commandExistsWindows(cmd: string): Promise<boolean> {
  try {
    await execFileAsync('cmd.exe', ['/c', 'where', cmd], { timeout: 5_000 })
    return true
  } catch {
    return false
  }
}

/**
 * Returns true if secret-tool can talk to a Secret Service.
 *
 * We intentionally avoid using store/lookup here; a search with an unlikely
 * attribute is enough to force a D-Bus connection.
 */
async function linuxSecretToolUsable(): Promise<boolean> {
  try {
    await execFileAsync('secret-tool', ['search', '--all', 'service', 'clawvault'], { timeout: 5_000 })
    // Even if search works, storing may fail if the default collection is missing.
    return await linuxSecretToolWritable()
  } catch (err: any) {
    const stderr = (err?.stderr ?? '').toString()
    const stdout = (err?.stdout ?? '').toString()

    // secret-tool returns exit code 1 when nothing is found; that still means it
    // successfully contacted the secret service.
    const looksLikeNoResults =
      stderr.trim() === '' && stdout.trim() === '' && typeof err?.code === 'number'

    if (looksLikeNoResults) {
      return await linuxSecretToolWritable()
    }

    // Common misconfiguration: Secret Service reachable but default collection missing.
    if (
      stderr.includes('Object does not exist at path') ||
      stderr.includes('/org/freedesktop/secrets/collection/login')
    ) {
      return false
    }

    // Headless / no session bus scenarios.
    if (
      stderr.includes('Cannot autolaunch D-Bus without X11 $DISPLAY') ||
      stderr.includes('Failed to execute child process') ||
      stderr.toLowerCase().includes('dbus')
    ) {
      return false
    }

    // Conservative: if something else went wrong, treat as not usable.
    return false
  }
}

async function linuxSecretToolWritable(): Promise<boolean> {
  const probeKey = '__CLAWVAULT_PROBE__'
  try {
    // Use a minimal store+clear probe to ensure the default collection exists and is writable.
    await execFileAsync('sh', [
      '-lc',
      `printf probe | secret-tool store --label='ClawVault probe' service clawvault key ${probeKey}`
    ], { timeout: 5_000 })
    await execFileAsync('secret-tool', ['clear', 'service', 'clawvault', 'key', probeKey], { timeout: 5_000 })
    return true
  } catch (err: any) {
    const stderr = (err?.stderr ?? '').toString()
    if (
      stderr.includes('Object does not exist at path') ||
      stderr.includes('/org/freedesktop/secrets/collection/login')
    ) {
      return false
    }
    // Any other failure: treat as not writable.
    return false
  }
}
