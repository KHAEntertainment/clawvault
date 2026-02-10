import { Command } from 'commander'
import { openclawMigrateCommand } from './openclaw-migrate.js'
import { restoreCommand } from './openclaw-restore.js'

export const openclawCommand = new Command('openclaw')
  .description('OpenClaw integration utilities')

openclawCommand.addCommand(openclawMigrateCommand)
openclawCommand.addCommand(restoreCommand)
