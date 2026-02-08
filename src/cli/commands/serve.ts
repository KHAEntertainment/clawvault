/**
 * Serve Command
 *
 * Starts the web UI server for secret submission.
 * Web UI allows submitting secrets directly to the keyring, bypassing AI context.
 */

import { Command } from 'commander'
import chalk from 'chalk'
import { createStorage } from '../../storage/index.js'

interface ServeOptions {
  port: string
  host: string
  tls?: boolean
  cert?: string
  key?: string
}

export const serveCommand = new Command('serve')
  .description('Start web UI server for secret submission')
  .option('-p, --port <port>', 'Port number', '3000')
  .option('-H, --host <host>', 'Host address', 'localhost')
  .option('--tls', 'Enable HTTPS')
  .option('--cert <path>', 'TLS certificate path')
  .option('--key <path>', 'TLS key path')
  .action(async (options: ServeOptions) => {
    const storage = await createStorage()
    const port = parseInt(options.port, 10)

    // Validate TLS options
    if (options.tls && (!options.cert || !options.key)) {
      console.log(chalk.red('Error: --cert and --key are required when using --tls'))
      process.exit(1)
    }

    console.log(chalk.cyan('ClawVault Web UI'))
    console.log(chalk.gray('Secrets are submitted directly to the encrypted keyring.'))
    console.log('')

    console.log(chalk.gray(`Starting server on ${options.host}:${port}`))

    try {
      // Try to import web module (may not exist in partial builds)
      let webModule: Awaited<typeof import('../../web/index.js')>
      try {
        webModule = await import('../../web/index.js')
      } catch (error: unknown) {
        const code =
          error && typeof error === 'object' && 'code' in error
            ? String((error as { code?: string }).code)
            : ''

        if (code === 'ERR_MODULE_NOT_FOUND') {
          console.log('')
          console.log(chalk.yellow('Web UI module not found.'))
          console.log(chalk.gray('For now, use the CLI commands:'))
          console.log(chalk.gray(`  clawvault add <name>    - Add a secret`))
          console.log(chalk.gray(`  clawvault list          - List secrets`))
          console.log(chalk.gray(`  clawvault rotate <name> - Update a secret`))
          return
        }

        throw error
      }

      await webModule.startServer(storage, {
        port,
        host: options.host,
        ...(options.tls && {
          tls: {
            cert: options.cert!,
            key: options.key!
          }
        })
      })

      const protocol = options.tls ? 'https' : 'http'
      console.log('')
      console.log(chalk.green(`Server running at ${protocol}://${options.host}:${port}`))
      console.log(chalk.gray('Press Ctrl+C to stop'))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      console.log(chalk.red(`Failed to start server: ${message}`))
      process.exit(1)
    }
  })
