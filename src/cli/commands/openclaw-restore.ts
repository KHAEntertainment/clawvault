/**
 * Restore Command
 *
 * Restores auth-profiles.json from backup in case migration fails.
 * This is the "failsafe" command shown to users before migration.
 */

import { Command } from 'commander'
import chalk from 'chalk'
import { promises as fs } from 'fs'
import { join, dirname } from 'path'

interface RestoreOptions {
  backupPath: string
  agentId?: string
  openclawDir?: string
  yes?: boolean
}

export const restoreCommand = new Command('restore')
  .description('Restore auth-profiles.json from backup (failsafe for failed migration)')
  .argument('<backup-path>', 'Path to the .bak file created during migration')
  .option('-y, --yes', 'Skip confirmation prompt')
  .option('--agent-id <id>', 'Agent ID (optional, for verification)')
  .option('--openclaw-dir <path>', 'OpenClaw root directory (default: ~/.openclaw)')
  .action(async (backupPath: string, options: RestoreOptions) => {
    try {
      // Verify backup file exists
      try {
        await fs.access(backupPath)
      } catch {
        console.log(chalk.red(`Error: Backup file not found: ${backupPath}`))
        console.log(chalk.gray('Check the path and try again.'))
        process.exitCode = 1
        return
      }

      // Determine target path (the original auth-profiles.json)
      const targetDir = dirname(backupPath)
      const targetPath = join(targetDir, 'auth-profiles.json')

      console.log(chalk.yellow('⚠️  RESTORE OPERATION'))
      console.log('')
      console.log(chalk.gray('This will restore your auth-profiles.json from backup:'))
      console.log(chalk.cyan(`  From: ${backupPath}`))
      console.log(chalk.cyan(`  To:   ${targetPath}`))
      console.log('')
      console.log(chalk.yellow('Any changes made after the backup will be lost.'))
      console.log('')

      if (!options.yes) {
        // In a real scenario, we'd use inquirer here
        // For now, require --yes flag for non-interactive use
        console.log(chalk.gray('Re-run with --yes to confirm:'))
        console.log(chalk.gray(`  clawvault openclaw restore "${backupPath}" --yes`))
        process.exitCode = 1
        return
      }

      // Read backup to verify it's valid JSON
      const backupData = await fs.readFile(backupPath, 'utf-8')
      try {
        JSON.parse(backupData)
      } catch {
        console.log(chalk.red('Error: Backup file contains invalid JSON'))
        console.log(chalk.gray('The backup may be corrupted. Manual intervention required.'))
        process.exitCode = 1
        return
      }

      // Create a safety backup of current state (in case restore goes wrong)
      const currentBackupPath = join(targetDir, `auth-profiles.json.pre-restore.${Date.now()}`)
      try {
        await fs.copyFile(targetPath, currentBackupPath)
        console.log(chalk.gray(`Created safety backup: ${currentBackupPath}`))
      } catch {
        // Current file might not exist, that's okay
      }

      // Perform restore
      await fs.copyFile(backupPath, targetPath)
      
      console.log('')
      console.log(chalk.green('✅ Restore completed successfully'))
      console.log(chalk.gray(`Restored: ${targetPath}`))
      console.log('')
      console.log(chalk.yellow('Next steps:'))
      console.log(chalk.gray('  1. Restart OpenClaw Gateway'))
      console.log(chalk.gray('  2. Verify agents can authenticate'))
      console.log(chalk.gray('  3. If successful, you may delete the backup:'))
      console.log(chalk.gray(`     rm "${backupPath}"`))

    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(chalk.red(`Restore failed: ${message}`))
      process.exitCode = 1
    }
  })
