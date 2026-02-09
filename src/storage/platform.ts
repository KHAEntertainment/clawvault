import { execFile } from 'child_process'
import { promisify } from 'util'
import { PlatformInfo } from './interfaces.js'

const execFileAsync = promisify(execFile)

/**
 * Detect the current platform and available keyring provider.
 *
 * IMPORTANT: On Linux, "secret-tool" may exist but still be unusable in headless
 * environments (no D-Bus session bus). In that case we should fall back to the
 * encrypted-file provider rather than hard-fail at runtime.
 */
export async function detectPlatform(): Promise<PlatformInfo> {
  const platform = process.platform

  if (platform === 'linux') {
    const hasSecretTool = await commandExists('secret-tool')
    if (!hasSecretTool) return { platform, hasKeyring: false, provider: 'fallback' }

    const usable = await linuxSecretToolUsable()
    if (!usable) return { platform, hasKeyring: false, provider: 'fallback' }

    return { platform, hasKeyring: true, provider: 'linux' }
  }

  if (platform === 'darwin') {
    const hasSecurity = await commandExists('security')
    return {
      platform,
      hasKeyring: hasSecurity,
      provider: hasSecurity ? 'macos' : 'fallback',
    }
  }

  if (platform === 'win32') {
    // "where" is a built-in on Windows; execute via cmd.exe.
    const hasCmdKey = await commandExistsWindows('cmdkey')
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
    await execFileAsync('sh', ['-lc', `command -v ${cmd}`])
    return true
  } catch {
    return false
  }
}

async function commandExistsWindows(cmd: string): Promise<boolean> {
  try {
    await execFileAsync('cmd.exe', ['/c', 'where', cmd])
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
    await execFileAsync('secret-tool', ['search', '--all', 'service', 'clawvault'])
    return true
  } catch (err: any) {
    const stderr = (err?.stderr ?? '').toString()
    const stdout = (err?.stdout ?? '').toString()

    // secret-tool returns exit code 1 when nothing is found; that still means it
    // successfully contacted the secret service.
    const looksLikeNoResults =
      stderr.trim() === '' && stdout.trim() === '' && typeof err?.code === 'number'

    if (looksLikeNoResults) return true

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
