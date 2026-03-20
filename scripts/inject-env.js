#!/usr/bin/env node
/**
 * Inject ClawVault secrets into systemd user environment.
 *
 * This script retrieves secrets from the keyring and injects them
 * into the systemd user session environment using `systemctl --user import-environment`.
 *
 * SECURITY: Secret values are never logged. Only metadata is printed.
 */

import { execSync } from 'child_process'
import { createStorage } from '../dist/storage/index.js'

const SECRET_NAMES = [
  'OPENCLAW_ZAI_ZAI_DEFAULT_KEY',
  'OPENCLAW_KIMI_CODING_KIMI_CODING_DEFAULT_KEY',
  'OPENAI_API_KEY'
]

async function main() {
  const storage = await createStorage()
  const injected = []
  const skipped = []

  for (const name of SECRET_NAMES) {
    try {
      const value = await storage.get(name)
      if (value) {
        // Set in current process environment
        process.env[name] = value
        injected.push(name)
      } else {
        skipped.push(name)
      }
    } catch (error) {
      console.error(`Failed to retrieve ${name}:`, error.message)
      skipped.push(name)
    }
  }

  if (injected.length > 0) {
    // Import into systemd user environment
    try {
      execSync(`systemctl --user import-environment ${injected.join(' ')}`, {
        stdio: 'inherit'
      })
      console.error(`Injected ${injected.length} secrets into systemd environment`)
    } catch (error) {
      console.error('Failed to import environment:', error.message)
      process.exit(1)
    }
  }

  if (skipped.length > 0) {
    console.error(`Skipped ${skipped.length} missing secrets: ${skipped.join(', ')}`)
  }

  console.error('Done. Restart the gateway with: openclaw gateway restart')
}

main().catch(error => {
  console.error('Error:', error)
  process.exit(1)
})
