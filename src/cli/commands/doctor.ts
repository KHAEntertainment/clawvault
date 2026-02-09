/**
 * Doctor Command
 *
 * Diagnoses ClawVault installation and checks for missing dependencies.
 * Provides platform-specific installation instructions.
 */

import { Command } from 'commander'
import chalk from 'chalk'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

interface DoctorResult {
  name: string
  found: boolean
  required: boolean
  installCommand?: string
}

export const doctorCommand = new Command('doctor')
  .description('Check ClawVault installation and dependencies')
  .action(async () => {
    console.log(chalk.cyan('ClawVault Doctor\n'))
    console.log(chalk.gray('Checking installation and dependencies...\n'))

    const results: DoctorResult[] = []
    const platform = process.platform

    // Check platform-specific tools
    if (platform === 'linux') {
      results.push(await checkCommand('secret-tool', 'GNOME Keyring storage', true, [
        'Debian/Ubuntu: sudo apt install libsecret-tools',
        'Fedora/RHEL:    sudo dnf install libsecret',
        'Arch Linux:     sudo pacman -S libsecret',
      ]))
      results.push(await checkCommand('gdbus', 'Secret service query', false))
    } else if (platform === 'darwin') {
      results.push(await checkCommand('security', 'macOS Keychain', true))
    } else if (platform === 'win32') {
      results.push(await checkCommand('cmdkey', 'Windows Credential Manager', true))
      results.push(await checkCommand('powershell', 'PowerShell (optional)', false))
    }

    // Check optional tools
    results.push(await checkCommand('systemctl', 'Systemd integration (optional)', false))

    // Display results
    console.log(chalk.bold('Dependency Status:\n'))

    const allRequiredFound = results.filter(r => r.required).every(r => r.found)

    for (const result of results) {
      const status = result.found
        ? chalk.green('✓')
        : result.required
          ? chalk.red('✗')
          : chalk.yellow('⚠')

      console.log(`  ${status} ${result.name}`)

      if (!result.found && result.required) {
        if (result.installCommand) {
          console.log(chalk.gray(`    Installation: ${result.installCommand}`))
        }
      } else if (!result.found && !result.required) {
        console.log(chalk.gray(`    Optional - not required for basic operation`))
      }
    }

    console.log('')

    if (allRequiredFound) {
      console.log(chalk.green('✓ All required dependencies are installed.\n'))
      console.log(chalk.gray('ClawVault is ready to use with secure keyring storage.'))
    } else {
      console.log(chalk.yellow('⚠ Some required dependencies are missing.\n'))
      console.log(chalk.white('To install:'))
      console.log(chalk.gray('  1. Run the installation commands shown above (requires sudo)'))
      console.log(chalk.gray('  2. Re-run your ClawVault command\n'))

      console.log(chalk.yellow('Note:'))
      console.log(chalk.gray(
        '  We do not automate sudo installation for security reasons.\n' +
        '  OpenClaw typically runs as a non-privileged user account.\n' +
        '  Install dependencies manually using your admin account.'
      ))
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
    await execAsync(`command -v ${cmd}`)
    return {
      name,
      found: true,
      required
    }
  } catch {
    return {
      name,
      found: false,
      required,
      installCommand: installCmds ? installCmds.join('\n                    ') : undefined
    }
  }
}
