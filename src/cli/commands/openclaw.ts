import { Command } from 'commander'
import { openclawMigrateCommand } from './openclaw-migrate.js'

export const openclawCommand = new Command('openclaw')
  .description('OpenClaw integration utilities')

openclawCommand.addCommand(openclawMigrateCommand)
