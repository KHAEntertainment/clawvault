#!/usr/bin/env node
/**
 * ClawVault CLI Entry Point
 *
 * Secure secret management for OpenClaw.
 * Secrets are stored in OS-native encrypted keyrings and NEVER enter AI context.
 */

import { Command } from 'commander'
import { addCommand } from './commands/add.js'
import { listCommand } from './commands/list.js'
import { removeCommand } from './commands/remove.js'
import { rotateCommand } from './commands/rotate.js'
import { serveCommand } from './commands/serve.js'

const program = new Command()

program
  .name('clawvault')
  .description('Secure secret management for OpenClaw')
  .version('0.1.0')

// Register all subcommands
program.addCommand(addCommand)
program.addCommand(listCommand)
program.addCommand(removeCommand)
program.addCommand(rotateCommand)
program.addCommand(serveCommand)

// Parse and execute
program.parse()
