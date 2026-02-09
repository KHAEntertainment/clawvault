import { execSync } from 'child_process'

export function hasSystemdUserSession(): boolean {
  if (process.platform !== 'linux') {
    return false
  }

  try {
    execSync('systemctl --user show-environment', { stdio: 'ignore', timeout: 5_000 })
    return true
  } catch {
    return false
  }
}
