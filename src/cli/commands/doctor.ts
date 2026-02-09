/**
 * Doctor Command
 *
 * Diagnoses ClawVault installation and checks for missing dependencies.
 * Provides platform-specific installation instructions.
 */

import { Command } from 'commander'
import chalk from 'chalk'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

interface DoctorResult {
  name: string
  found: boolean
  required: boolean
  installCommand?: string
  details?: string
}

export const doctorCommand = new Command('doctor')
  .description('Check ClawVault installation and dependencies')
  .action(async () => {
    console.log(chalk.cyan('ClawVault Doctor\n'))
    console.log(chalk.gray('Checking installation and dependencies...\n'))

    const results: DoctorResult[] = []
    const platform = process.platform

    let keyringUsable = false

    // Platform-specific checks
    if (platform === 'linux') {
      const secretTool = await checkCommand(
        'secret-tool',
        'libsecret (secret-tool) installed',
        false,
        [
          'Debian/Ubuntu: sudo apt install libsecret-tools',
          'Fedora/RHEL:    sudo dnf install libsecret',
          'Arch Linux:     sudo pacman -S libsecret',
        ]
      )
      results.push(secretTool)

      if (secretTool.found) {
        const session = await checkLinuxSecretServiceSession()
        results.push(session)
        keyringUsable = session.found
      }

      results.push(await checkCommand('gdbus', 'gdbus (optional)', false))
    } else if (platform === 'darwin') {
      const mac = await checkCommand('security', 'macOS Keychain available', true)
      results.push(mac)
      keyringUsable = mac.found
    } else if (platform === 'win32') {
      const win = await checkCommandWindows('cmdkey', 'Windows Credential Manager available', true)
      results.push(win)
      keyringUsable = win.found
      results.push(await checkCommandWindows('powershell', 'PowerShell (optional)', false))
    }

    // Optional tools
    results.push(await checkCommand('systemctl', 'systemd integration (optional)', false))

    // Display results
    console.log(chalk.bold('Dependency Status:\n'))

    for (const result of results) {
      const status = result.found
        ? chalk.green('✓')
        : result.required
          ? chalk.red('✗')
          : chalk.yellow('⚠')

      console.log(`  ${status} ${result.name}`)

      if (result.details && !result.found) {
        console.log(chalk.gray(`    ${result.details}`))
      }

      if (!result.found && result.installCommand) {
        console.log(chalk.gray(`    ${result.installCommand}`))
      } else if (!result.found && !result.required && !result.installCommand) {
        console.log(chalk.gray('    Optional - not required for basic operation'))
      }
    }

    console.log('')

    if (platform === 'linux') {
      if (keyringUsable) {
        console.log(chalk.green('✓ Linux keyring storage is available.'))
        console.log(chalk.gray('ClawVault will use GNOME Keyring (secret-tool).'))
      } else {
        console.log(chalk.yellow('⚠ Linux keyring storage is not usable in this session.'))
        console.log(chalk.gray('ClawVault will fall back to encrypted-file storage on this machine.'))
        console.log(chalk.gray('That is fine for headless servers, but it is less secure than a keyring.'))
      }
    } else {
      const requiredOk = results.filter(r => r.required).every(r => r.found)
      if (requiredOk) {
        console.log(chalk.green('✓ All required dependencies are installed.'))
      } else {
        console.log(chalk.yellow('⚠ Some required dependencies are missing.'))
      }

      if (keyringUsable) {
        console.log(chalk.gray('ClawVault is ready to use with secure keyring storage.'))
      } else {
        console.log(chalk.gray('ClawVault can still operate using fallback encrypted-file storage.'))
      }
    }

    console.log('')
    console.log(chalk.gray('For more information, see: docs/SECURITY.md'))
    console.log('')
  })

async function checkCommand(
  cmd: string,
  name: string,
  required: boolean,
  installCmds?: string[]
): Promise<DoctorResult> {
  try {
    await execFileAsync('sh', ['-lc', `command -v ${cmd}`])
    return { name, found: true, required }
  } catch {
    return {
      name,
      found: false,
      required,
      installCommand: installCmds ? installCmds.join('\n                    ') : undefined,
    }
  }
}

async function checkCommandWindows(
  cmd: string,
  name: string,
  required: boolean,
  installCmds?: string[]
): Promise<DoctorResult> {
  try {
    await execFileAsync('cmd.exe', ['/c', 'where', cmd])
    return { name, found: true, required }
  } catch {
    return {
      name,
      found: false,
      required,
      installCommand: installCmds ? installCmds.join('\n                    ') : undefined,
    }
  }
}

async function checkLinuxSecretServiceSession(): Promise<DoctorResult> {
  try {
    await execFileAsync('secret-tool', ['search', '--all', 'service', 'clawvault'])
    return { name: 'Secret Service reachable (D-Bus session)', found: true, required: false }
  } catch (err: any) {
    const stderr = (err?.stderr ?? '').toString()
    const stdout = (err?.stdout ?? '').toString()

    // exit code 1 with no output = no results found (still reachable)
    const looksLikeNoResults =
      stderr.trim() === '' && stdout.trim() === '' && typeof err?.code === 'number'

    if (looksLikeNoResults) {
      return { name: 'Secret Service reachable (D-Bus session)', found: true, required: false }
    }

    if (stderr.includes('Cannot autolaunch D-Bus without X11 $DISPLAY')) {
      return {
        name: 'Secret Service reachable (D-Bus session)',
        found: false,
        required: false,
        details: 'Headless session detected (no D-Bus session bus).',
        installCommand:
          'Fix options:\n'
          + '  • Run your command inside a session bus:\n'
          + '      dbus-run-session -- clawvault doctor\n'
          + '  • Or set up a persistent user session bus/keyring (systemd user service).\n'
          + '  • Otherwise ClawVault will use fallback encrypted-file storage.',
      }
    }

    return {
      name: 'Secret Service reachable (D-Bus session)',
      found: false,
      required: false,
      details: stderr.trim() || 'secret-tool failed to contact a Secret Service',
      installCommand:
        'ClawVault will fall back to encrypted-file storage unless a Secret Service is available.',
    }
  }
}
