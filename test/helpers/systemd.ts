import { execSync } from 'child_process'

export function hasSystemdUserSession(): boolean {
  if (process.platform !== 'linux') {
    return false
  }

  try {
    execSync('systemctl --user show-environment', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}
