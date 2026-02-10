/**
 * Request Command
 *
 * Starts an ephemeral web server and creates a one-time secret request.
 * Prints the URL for the user to open, then waits until the secret is submitted
 * or the request expires.
 */

import { Command } from 'commander'
import chalk from 'chalk'
import { createStorage } from '../../storage/index.js'

interface RequestOptions {
  port: string
  host: string
  tls?: boolean
  cert?: string
  key?: string
  allowInsecureHttp?: boolean
  label?: string
  timeoutMin?: string
}

export const requestCommand = new Command('request')
  .description('Create a one-time secret request link and wait for submission')
  .argument('<secretName>', 'Secret name (e.g., OPENAI_API_KEY)')
  .option('-p, --port <port>', 'Port number', '3000')
  .option('-H, --host <host>', 'Host address', 'localhost')
  .option('--tls', 'Enable HTTPS')
  .option('--cert <path>', 'TLS certificate path')
  .option('--key <path>', 'TLS key path')
  .option('--allow-insecure-http', 'Allow binding non-localhost over HTTP (strongly discouraged)', false)
  .option('--label <label>', 'Label shown on the request page')
  .option('--timeout-min <minutes>', 'Override request TTL in minutes (default 15)', '15')
  .action(async (secretName: string, options: RequestOptions) => {
    const port = parseInt(options.port, 10)
    const ttlMin = parseInt(options.timeoutMin ?? '15', 10)

    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      console.log(chalk.red('Error: invalid port number'))
      process.exitCode = 1
      return
    }

    if (!Number.isFinite(ttlMin) || ttlMin < 1) {
      console.log(chalk.red('Error: invalid timeout-min value'))
      process.exitCode = 1
      return
    }

    if (!/^[A-Z][A-Z0-9_]*$/.test(secretName)) {
      console.log(chalk.red('Error: invalid secret name. Must match /^[A-Z][A-Z0-9_]*$/'))
      process.exitCode = 1
      return
    }

    if (options.tls && (!options.cert || !options.key)) {
      console.log(chalk.red('Error: --cert and --key are required when using --tls'))
      process.exitCode = 1
      return
    }

    let storage
    let webModule
    try {
      storage = await createStorage()
      webModule = await import('../../web/index.js')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.log(chalk.red(`Failed to initialize: ${message}`))
      process.exitCode = 1
      return
    }

    try {
      const result = await webModule.startServer(storage, {
        port,
        host: options.host,
        ...(options.tls && {
          tls: {
            cert: options.cert!,
            key: options.key!,
          }
        }),
        allowInsecureHttp: options.allowInsecureHttp ?? false,
        requestTtlMs: ttlMin * 60 * 1000,
      })

      const r = result.requestStore.create(secretName, options.label)
      const url = `${result.origin}/requests/${r.id}`

      console.log(chalk.cyan('One-time secret request link:'))
      console.log(chalk.bold(url))
      console.log('')
      console.log(chalk.gray(`Secret name: ${secretName}`))
      console.log(chalk.gray(`Expires: ${new Date(r.expiresAt).toLocaleString()}`))
      console.log(chalk.gray('Waiting for submission... (Ctrl+C to cancel)'))

      try {
        await result.requestStore.waitForFulfilled(r.id)
        console.log(chalk.green('Secret received and stored.'))
        await result.close()
        process.exitCode = 0
      } catch (err: any) {
        console.log(chalk.red(`Request expired: ${err?.message ?? 'expired'}`))
        await result.close()
        process.exitCode = 1
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      console.log(chalk.red(`Failed to start request server: ${message}`))
      process.exitCode = 1
    }
  })
