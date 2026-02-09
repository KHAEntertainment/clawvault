# ClawVault Implementation Plan

## Phase 0: Documentation Discovery (Complete)

### Allowed APIs and Reference Patterns

#### secret-tool Commands (Linux/GNOME Keyring)
**Source:** `docs/reference/reference-secret-manager.sh`

| Operation | Command Pattern |
|-----------|----------------|
| Store | `echo -n "VALUE" \| secret-tool store --label="LABEL" service "SERVICE_NAME" key "KEY_NAME"` |
| Get | `secret-tool lookup service "SERVICE_NAME" key "KEY_NAME" 2>/dev/null` |
| Delete | `secret-tool remove service "SERVICE_NAME" key "KEY_NAME"` |
| List | No native command - iterate known keys with lookup |

**Keyring Schema:**
- `service`: "clawvault" (constant)
- `key`: `<SECRET_NAME>` (variable)
- `--label`: "ClawVault: <DESCRIPTION>" (human-readable)

#### Storage Interface (from docs/planning/DESIGN.md)
```typescript
interface StorageProvider {
  set(name: string, value: string): Promise<void>
  get(name: string): Promise<string | null>
  delete(name: string): Promise<void>
  list(): Promise<string[]>
}
```

#### Available Dependencies (from package.json)
- `express: ^4.18.2` - Web UI server
- `commander: ^11.0.0` - CLI framework
- `chalk: ^5.3.0` - Terminal colors (ESM only)
- `inquirer: ^9.2.0` - Interactive prompts
- `jest: ^29.7.0` - Testing

#### Security Anti-Patterns to Avoid
From `docs/reference/reference-confidant.md`:
- **NEVER** pass secret values through AI context
- **NEVER** log secret values (metadata only)
- **NEVER** store secrets in config files
- **ALWAYS** bind web UI to localhost by default

---

## Phase 1: Core Storage Layer

### What to Implement

#### Task 1.1: Type Definitions
**File:** `src/types/index.ts`

Copy these types from docs/planning/DESIGN.md Section 5:

```typescript
// Core types
export interface SecretMetadata {
  name: string
  description: string
  provider: string
  environmentVar: string
  createdAt: Date
  updatedAt: Date
  length: number  // Only length, never the value
}

export interface SecretOptions {
  description: string
  provider: string
  environmentVar?: string
  required?: boolean
}

export interface GatewayConfig {
  restartOnUpdate: boolean
  services: string[]
}

export interface Config {
  version: number
  secrets: Record<string, SecretDefinition>
  gateway: GatewayConfig
}

export interface SecretDefinition {
  description: string
  environmentVar: string
  provider: string
  required: boolean
  gateways: string[]
  rotation?: RotationOptions
  validation?: ValidationOptions
}

export interface RotationOptions {
  enabled: boolean
  intervalDays: number
}

export interface ValidationOptions {
  pattern?: RegExp
  minLength?: number
  maxLength?: number
}
```

#### Task 1.2: Storage Interface
**File:** `src/storage/interfaces.ts`

```typescript
export interface StorageProvider {
  // Store a secret value
  set(name: string, value: string): Promise<void>

  // Retrieve a secret value (INTERNAL USE ONLY - never exposed to AI)
  get(name: string): Promise<string | null>

  // Delete a secret
  delete(name: string): Promise<void>

  // List all secret names
  list(): Promise<string[]>

  // Check if a secret exists
  has(name: string): Promise<boolean>
}

export interface PlatformInfo {
  platform: NodeJS.Platform
  hasKeyring: boolean
  provider: 'linux' | 'macos' | 'windows' | 'fallback'
}
```

#### Task 1.3: Platform Detection
**File:** `src/storage/platform.ts`

```typescript
import { exec } from 'child_process'
import { promisify } from 'util'
import { PlatformInfo } from './interfaces'

const execAsync = promisify(exec)

export async function detectPlatform(): Promise<PlatformInfo> {
  const platform = process.platform

  if (platform === 'linux') {
    try {
      await execAsync('command -v secret-tool')
      return { platform, hasKeyring: true, provider: 'linux' }
    } catch {
      return { platform, hasKeyring: false, provider: 'fallback' }
    }
  }

  if (platform === 'darwin') {
    try {
      await execAsync('command -v security')
      return { platform, hasKeyring: true, provider: 'macos' }
    } catch {
      return { platform, hasKeyring: false, provider: 'fallback' }
    }
  }

  if (platform === 'win32') {
    try {
      await execAsync('where cmdkey')
      return { platform, hasKeyring: true, provider: 'windows' }
    } catch {
      return { platform, hasKeyring: false, provider: 'fallback' }
    }
  }

  return { platform, hasKeyring: false, provider: 'fallback' }
}
```

#### Task 1.4: Linux Keyring Provider
**File:** `src/storage/providers/linux.ts`

Copy pattern from `docs/reference/reference-secret-manager.sh:45-80`:

```typescript
import { exec } from 'child_process'
import { promisify } from 'util'
import { StorageProvider } from '../interfaces'

const execAsync = promisify(exec)

const SERVICE = 'clawvault'

export class LinuxKeyringProvider implements StorageProvider {
  async set(name: string, value: string): Promise<void> {
    const label = `ClawVault: ${name}`
    // From reference: echo -n "$VALUE" | secret-tool store --label="$LABEL" service "$SERVICE" key "$KEY_NAME"
    const cmd = `echo -n "${value}" | secret-tool store --label="${label}" service "${SERVICE}" key "${name}"`
    await execAsync(cmd)
  }

  async get(name: string): Promise<string | null> {
    // From reference: secret-tool lookup service "$SERVICE" key "$KEY_NAME" 2>/dev/null
    try {
      const { stdout } = await execAsync(
        `secret-tool lookup service "${SERVICE}" key "${name}" 2>/dev/null`,
        { encoding: 'utf-8' }
      )
      return stdout.trim() || null
    } catch {
      return null
    }
  }

  async delete(name: string): Promise<void> {
    await execAsync(`secret-tool remove service "${SERVICE}" key "${name}"`)
  }

  async list(): Promise<string[]> {
    // secret-tool has no native list - use gdbus
    try {
      const { stdout } = await execAsync(
        'gdbus call --session --dest org.freedesktop.secrets ' +
        '--object-path /org/freedesktop/secrets/collections/login ' +
        '--method org.freedesktop.Secret.Service.SearchItems ' +
        `"{'service': <'clawvault'>}" 2>/dev/null || true`
      )
      // Parse output to extract names
      return this.parseGdbusOutput(stdout)
    } catch {
      return []
    }
  }

  async has(name: string): Promise<boolean> {
    const val = await this.get(name)
    return val !== null
  }

  private parseGdbusOutput(output: string): string[] {
    // Parse gdbus output to extract secret names
    // Implementation depends on gdbus output format
    return []
  }
}
```

#### Task 1.5: Storage Factory
**File:** `src/storage/index.ts`

```typescript
import { detectPlatform } from './platform'
import { LinuxKeyringProvider } from './providers/linux'
import { FallbackProvider } from './providers/fallback'
import { StorageProvider } from './interfaces'

export async function createStorage(): Promise<StorageProvider> {
  const platform = await detectPlatform()

  switch (platform.provider) {
    case 'linux':
      return new LinuxKeyringProvider()
    case 'macos':
      // TODO: Phase 6
    case 'windows':
      // TODO: Phase 6
    case 'fallback':
      return new FallbackProvider()
    default:
      return new FallbackProvider()
  }
}

export { StorageProvider } from './interfaces'
export { detectPlatform } from './platform'
```

#### Task 1.6: Fallback Provider
**File:** `src/storage/providers/fallback.ts`

```typescript
import { createCipherIV, createDecipherIV, randomBytes, scryptSync } from 'crypto'
import { promises as fs } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { StorageProvider } from '../interfaces'

// Encrypted JSON file storage - emits warning on use
export class FallbackProvider implements StorageProvider {
  private storagePath: string
  private initialized = false

  constructor() {
    this.storagePath = join(homedir(), '.clawvault', 'secrets.enc.json')
    this.emitWarning()
  }

  private emitWarning() {
    console.warn('⚠️  WARNING: Using fallback encrypted file storage.')
    console.warn('⚠️  This is less secure than platform keyring storage.')
    console.warn('⚠️  Install your platform keyring tools for better security.')
  }

  private async getEncryptionKey(): Promise<Buffer> {
    // Use a key derivation function with a machine-specific salt
    const saltPath = join(homedir(), '.clawvault', '.salt')
    let salt: Buffer

    try {
      salt = await fs.readFile(saltPath)
    } catch {
      salt = randomBytes(16)
      await fs.mkdir(join(homedir(), '.clawvault'), { recursive: true })
      await fs.writeFile(saltPath, salt)
    }

    // Derive key from machine ID + user-specific data
    const machineId = process.env.USER || process.env.USERNAME || 'default'
    return scryptSync(machineId + 'clawvault-key', salt, 32)
  }

  private async readStore(): Promise<Record<string, string>> {
    try {
      const data = await fs.readFile(this.storagePath, 'utf-8')
      const key = await this.getEncryptionKey()
      // Decrypt and parse
      return JSON.parse(data) // Placeholder - add actual decryption
    } catch {
      return {}
    }
  }

  async set(name: string, value: string): Promise<void> {
    const store = await this.readStore()
    store[name] = value
    await fs.writeFile(this.storagePath, JSON.stringify(store))
  }

  async get(name: string): Promise<string | null> {
    const store = await this.readStore()
    return store[name] || null
  }

  async delete(name: string): Promise<void> {
    const store = await this.readStore()
    delete store[name]
    await fs.writeFile(this.storagePath, JSON.stringify(store))
  }

  async list(): Promise<string[]> {
    const store = await this.readStore()
    return Object.keys(store)
  }

  async has(name: string): Promise<boolean> {
    const store = await this.readStore()
    return name in store
  }
}
```

#### Task 1.7: Audit Logging
**File:** `src/storage/audit.ts`

```typescript
import { join } from 'path'
import { homedir } from 'os'
import { promises as fs } from 'fs'

export interface AuditEntry {
  timestamp: string
  action: 'set' | 'get' | 'delete' | 'list'
  secretName: string
  success: boolean
  error?: string
  // NEVER include secret values
}

export class AuditLogger {
  private logPath: string

  constructor() {
    this.logPath = join(homedir(), '.clawvault', 'audit.log')
  }

  async log(entry: AuditEntry): Promise<void> {
    const line = JSON.stringify(entry) + '\n'
    await fs.appendFile(this.logPath, line)
  }

  async logSet(secretName: string, success: boolean, error?: string): Promise<void> {
    await this.log({
      timestamp: new Date().toISOString(),
      action: 'set',
      secretName,
      success,
      error
    })
  }

  async logGet(secretName: string, success: boolean, error?: string): Promise<void> {
    await this.log({
      timestamp: new Date().toISOString(),
      action: 'get',
      secretName,
      success,
      error
    })
  }
}
```

### Verification Checklist Phase 1

```bash
# TypeScript compiles
npx tsc --noEmit

# Run storage tests
npm test test/unit/storage/

# Verify no value leakage in code
grep -r "value" src/storage/ | grep -v ".ts:" | grep -v "// " | grep -v "Promise<string"

# Verify audit logging doesn't include values
grep -r "audit" src/storage/ | grep -v "logPath" | grep -v "AuditEntry"
```

**Success criteria:**
- [ ] All TypeScript files compile without errors
- [ ] `npm test` passes for storage tests
- [ ] `secret-tool` commands execute successfully on Linux
- [ ] Audit logs contain metadata only, never values
- [ ] Error messages never include secret values

---

## Phase 2: Configuration System

### What to Implement

#### Task 2.1: Config Schema Validator
**File:** `src/config/schemas.ts`

```typescript
export const SECRET_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/

export interface ConfigSchema {
  version: number
  secrets: Record<string, SecretDefinitionSchema>
  gateway: GatewayConfigSchema
}

export interface SecretDefinitionSchema {
  description: string
  environmentVar: string
  provider: string
  required: boolean
  gateways: string[]
  rotation?: RotationSchema
  validation?: ValidationSchema
}

export function validateSecretName(name: string): boolean {
  return SECRET_NAME_PATTERN.test(name)
}

export function validateConfig(config: unknown): config is ConfigSchema {
  if (typeof config !== 'object' || config === null) {
    return false
  }

  const c = config as Record<string, unknown>

  if (c.version !== 1) {
    return false
  }

  if (typeof c.secrets !== 'object' || c.secrets === null) {
    return false
  }

  // Validate each secret definition
  for (const [name, def] of Object.entries(c.secrets as Record<string, unknown>)) {
    if (!validateSecretName(name)) {
      return false
    }
    // ... more validation
  }

  return true
}
```

#### Task 2.2: Config Loader
**File:** `src/config/index.ts`

```typescript
import { join } from 'path'
import { homedir } from 'os'
import { promises as fs } from 'fs'
import { validateConfig, ConfigSchema } from './schemas'

const CONFIG_PATH = join(homedir(), '.config', 'clawvault', 'secrets.json')

export async function loadConfig(): Promise<ConfigSchema> {
  try {
    const data = await fs.readFile(CONFIG_PATH, 'utf-8')
    const config = JSON.parse(data)

    if (!validateConfig(config)) {
      throw new Error('Invalid configuration format')
    }

    return config
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return createDefaultConfig()
    }
    throw error
  }
}

export async function saveConfig(config: ConfigSchema): Promise<void> {
  if (!validateConfig(config)) {
    throw new Error('Invalid configuration format')
  }

  await fs.mkdir(join(CONFIG_PATH, '..'), { recursive: true })
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2))
}

async function createDefaultConfig(): Promise<ConfigSchema> {
  const defaults = await import('./defaults').then(m => m.default)
  await saveConfig(defaults)
  return defaults
}
```

#### Task 2.3: Default Secrets Template
**File:** `src/config/defaults.ts`

```typescript
import { ConfigSchema } from './schemas'

const defaultConfig: ConfigSchema = {
  version: 1,
  secrets: {
    OPENAI_API_KEY: {
      description: 'OpenAI API key for GPT models',
      environmentVar: 'OPENAI_API_KEY',
      provider: 'openai',
      required: false,
      gateways: ['main'],
      validation: {
        pattern: /^sk-[a-zA-Z0-9]{48}$/,
        minLength: 51,
        maxLength: 51
      }
    },
    ANTHROPIC_API_KEY: {
      description: 'Anthropic API key for Claude models',
      environmentVar: 'ANTHROPIC_API_KEY',
      provider: 'anthropic',
      required: false,
      gateways: ['main'],
      validation: {
        pattern: /^sk-ant-[a-zA-Z0-9_-]{95}$/,
        minLength: 100,
        maxLength: 100
      }
    },
    GEMINI_API_KEY: {
      description: 'Google Gemini API key',
      environmentVar: 'GEMINI_API_KEY',
      provider: 'google',
      required: false,
      gateways: ['main']
    },
    DISCORD_BOT_TOKEN: {
      description: 'Discord bot token',
      environmentVar: 'DISCORD_BOT_TOKEN',
      provider: 'discord',
      required: false,
      gateways: ['main']
    }
  },
  gateway: {
    restartOnUpdate: true,
    services: ['openclaw-gateway.service']
  }
}

export default defaultConfig
```

### Verification Checklist Phase 2

```bash
# Config validation tests
npm test test/unit/config/

# Verify default config is valid
node -e "import('./dist/config/defaults.js').then(d => console.log('OK'))"

# Test config loading
npm test -- config.test.ts
```

**Success criteria:**
- [ ] Config loads from `~/.config/clawvault/secrets.json`
- [ ] Invalid config throws descriptive error
- [ ] Missing config creates default
- [ ] Secret name validation works
- [ ] Config never logs secret values

---

## Phase 3: Gateway Integration

### What to Implement

#### Task 3.1: Environment Injection
**File:** `src/gateway/environment.ts`

```typescript
import { StorageProvider } from '../storage'

export interface EnvironmentInjection {
  [key: string]: string
}

export async function injectSecrets(
  storage: StorageProvider,
  secretNames: string[]
): Promise<EnvironmentInjection> {
  const env: EnvironmentInjection = {}

  for (const name of secretNames) {
    const value = await storage.get(name)
    if (value) {
      const envVar = name // or lookup from config
      env[envVar] = value
    }
  }

  return env
}

// Export for systemd import-environment
export async function exportToSystemd(env: EnvironmentInjection): Promise<string> {
  const keys = Object.keys(env).join(' ')
  return `systemctl --user import-environment ${keys}`
}
```

#### Task 3.2: Systemd Service Manager
**File:** `src/gateway/systemd.ts`

Copy pattern from `docs/reference/reference-secret-manager.sh:150-170`:

```typescript
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export interface GatewayService {
  name: string
  isActive: boolean
  needsRestart: boolean
}

export class SystemdManager {
  async importEnvironment(envVars: string[]): Promise<void> {
    const vars = envVars.join(' ')
    await execAsync(`systemctl --user import-environment ${vars}`)
  }

  async restartService(serviceName: string): Promise<void> {
    await execAsync(`systemctl --user stop ${serviceName}`)
    // Wait for stop
    await new Promise(resolve => setTimeout(resolve, 2000))
    await execAsync(`systemctl --user start ${serviceName}`)
    // Wait for start
    await new Promise(resolve => setTimeout(resolve, 5000))
  }

  async isServiceActive(serviceName: string): Promise<boolean> {
    try {
      await execAsync(`systemctl --user is-active --quiet ${serviceName}`)
      return true
    } catch {
      return false
    }
  }

  async getStatus(serviceName: string): Promise<string> {
    const { stdout } = await execAsync(`systemctl --user status ${serviceName}`)
    return stdout
  }
}
```

#### Task 3.3: Gateway Integration Entry Point
**File:** `src/gateway/index.ts`

```typescript
export { injectSecrets, exportToSystemd } from './environment'
export { SystemdManager, GatewayService } from './systemd'

import { StorageProvider } from '../storage'
import { SystemdManager } from './systemd'
import { loadConfig } from '../config'

export async function injectToGateway(storage: StorageProvider): Promise<void> {
  const config = await loadConfig()
  const systemd = new SystemdManager()

  // Inject secrets into environment
  const secretNames = Object.keys(config.secrets)
  const envVars: string[] = []

  for (const name of secretNames) {
    const def = config.secrets[name]
    const value = await storage.get(name)
    if (value) {
      process.env[def.environmentVar] = value
      envVars.push(def.environmentVar)
    }
  }

  // Import to systemd
  await systemd.importEnvironment(envVars)

  // Restart gateway if configured
  if (config.gateway.restartOnUpdate) {
    for (const service of config.gateway.services) {
      await systemd.restartService(service)
    }
  }
}
```

### Verification Checklist Phase 3

```bash
# Gateway integration tests
npm test test/integration/gateway/

# Verify secrets injected (check with systemctl show-environment)
systemctl --user show-environment | grep OPENAI_API_KEY

# Verify gateway service running
systemctl --user status openclaw-gateway.service
```

**Success criteria:**
- [ ] Secrets appear in gateway environment
- [ ] Gateway service restarts successfully
- [ ] No secrets logged during injection
- [ ] Integration tests pass

---

## Phase 4: Web UI

### What to Implement

#### Task 4.1: Express Server
**File:** `src/web/index.ts`

```typescript
import express, { Request, Response } from 'express'
import { StorageProvider } from '../storage'
import { submitSecret } from './routes/submit'
import { statusRoute } from './routes/status'

export interface WebServerOptions {
  port: number
  host: string
  tls?: {
    cert: string
    key: string
  }
}

export async function createServer(
  storage: StorageProvider,
  options: WebServerOptions
): Promise<express.Application> {
  const app = express()

  app.use(express.urlencoded({ extended: true }))
  app.use(express.json())

  // Routes
  app.post('/api/submit', (req, res) => submitSecret(req, res, storage))
  app.get('/api/status', (req, res) => statusRoute(req, res, storage))

  // Serve form
  app.get('/', (_req, res) => {
    res.sendFile(join(__dirname, 'routes', 'templates', 'form.html'))
  })

  return app
}

export async function startServer(
  storage: StorageProvider,
  options: WebServerOptions
): Promise<void> {
  const app = await createServer(storage, options)

  if (options.tls) {
    const https = await import('https')
    const fs = await import('fs')
    const server = https.createServer(
      {
        cert: fs.readFileSync(options.tls.cert),
        key: fs.readFileSync(options.tls.key)
      },
      app
    )
    server.listen(options.port, options.host)
  } else {
    app.listen(options.port, options.host)
  }
}
```

#### Task 4.2: Secret Submission Route
**File:** `src/web/routes/submit.ts`

```typescript
import { Request, Response } from 'express'
import { StorageProvider } from '../../storage'

export async function submitSecret(
  req: Request,
  res: Response,
  storage: StorageProvider
): Promise<void> {
  const { secretName, secretValue, description } = req.body

  // Validate inputs
  if (!secretName || !secretValue) {
    res.status(400).json({ error: 'Missing required fields' })
    return
  }

  try {
    await storage.set(secretName, secretValue)
    res.json({
      success: true,
      message: `Secret "${secretName}" stored successfully`,
      name: secretName,
      length: secretValue.length
    })
  } catch (error: unknown) {
    res.status(500).json({
      error: 'Failed to store secret',
      message: (error as Error).message
    })
  }
}
```

#### Task 4.3: Status Route
**File:** `src/web/routes/status.ts`

```typescript
import { Request, Response } from 'express'
import { StorageProvider } from '../../storage'

export async function statusRoute(
  req: Request,
  res: Response,
  storage: StorageProvider
): Promise<void> {
  const secrets = await storage.list()

  res.json({
    status: 'ok',
    secrets: secrets.map(name => ({
      name,
      // Only metadata, never values
      length: 0 // Will be populated from storage metadata
    })),
    count: secrets.length
  })
}
```

#### Task 4.4: HTML Form Template
**File:** `src/web/routes/templates/form.html`

```html
<!DOCTYPE html>
<html>
<head>
  <title>ClawVault - Secret Submission</title>
  <style>
    body { font-family: system-ui; max-width: 600px; margin: 2rem auto; padding: 0 1rem; }
    .form-group { margin-bottom: 1rem; }
    label { display: block; margin-bottom: 0.5rem; font-weight: 600; }
    input, textarea { width: 100%; padding: 0.5rem; border: 1px solid #ccc; border-radius: 4px; }
    button { background: #007bff; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 4px; cursor: pointer; }
    button:hover { background: #0056b3; }
    .success { color: green; }
    .error { color: red; }
  </style>
</head>
<body>
  <h1>🦀 ClawVault</h1>
  <p>Submit secrets directly to encrypted keyring (bypasses AI context)</p>

  <form id="secretForm">
    <div class="form-group">
      <label for="secretName">Secret Name</label>
      <input type="text" id="secretName" name="secretName" required placeholder="OPENAI_API_KEY">
    </div>

    <div class="form-group">
      <label for="description">Description</label>
      <input type="text" id="description" name="description" placeholder="OpenAI API key">
    </div>

    <div class="form-group">
      <label for="secretValue">Secret Value</label>
      <input type="password" id="secretValue" name="secretValue" required>
    </div>

    <button type="submit">Store Secret</button>
  </form>

  <div id="result"></div>

  <script>
    document.getElementById('secretForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const data = Object.fromEntries(formData);

      try {
        const res = await fetch('/api/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        const result = await res.json();

        const resultDiv = document.getElementById('result');
        if (result.success) {
          resultDiv.innerHTML = `<div class="success">✓ ${result.message}</div>`;
          e.target.reset();
        } else {
          resultDiv.innerHTML = `<div class="error">✗ ${result.error}</div>`;
        }
      } catch (err) {
        document.getElementById('result').innerHTML = `<div class="error">✗ Failed to submit</div>`;
      }
    });
  </script>
</body>
</html>
```

### Verification Checklist Phase 4

```bash
# Web UI tests
npm test test/unit/web/

# Start server
node dist/web/index.js &

# Test submission
curl -X POST http://localhost:3000/api/submit \
  -H "Content-Type: application/json" \
  -d '{"secretName":"TEST_KEY","secretValue":"test123","description":"Test"}'

# Check status
curl http://localhost:3000/api/status

# Verify TLS (if enabled)
curl -k https://localhost:3443/api/status
```

**Success criteria:**
- [ ] Server starts on configured port
- [ ] Form submits secrets directly to keyring
- [ ] Status endpoint returns metadata only
- [ ] HTTPS works when enabled
- [ ] Security tests pass (no value leakage in responses)

---

## Phase 5: CLI Tool

### What to Implement

#### Task 5.1: CLI Entry Point
**File:** `src/cli/index.ts`

```typescript
#!/usr/bin/env node
import { Command } from 'commander'
import { addCommand } from './commands/add'
import { listCommand } from './commands/list'
import { removeCommand } from './commands/remove'
import { rotateCommand } from './commands/rotate'
import { serveCommand } from './commands/serve'

const program = new Command()

program
  .name('clawvault')
  .description('Secure secret management for OpenClaw')
  .version('1.0.0')

program.addCommand(addCommand)
program.addCommand(listCommand)
program.addCommand(removeCommand)
program.addCommand(rotateCommand)
program.addCommand(serveCommand)

program.parse()
```

#### Task 5.2: Add Command
**File:** `src/cli/commands/add.ts`

```typescript
import { Command } from 'commander'
import inquirer from 'inquirer'
import chalk from 'chalk'
import { createStorage } from '../../storage'
import { loadConfig } from '../../config'

export const addCommand = new Command('add')
  .description('Add a new secret')
  .argument('<name>', 'Secret name (e.g., OPENAI_API_KEY)')
  .option('-p, --provider <provider>', 'Service provider')
  .option('-e, --env <var>', 'Environment variable name')
  .action(async (name, options) => {
    const storage = await createStorage()

    // Check if secret already exists
    if (await storage.has(name)) {
      console.log(chalk.yellow(`Secret "${name}" already exists`))
      return
    }

    // Interactive prompt for value (hidden input)
    const { value } = await inquirer.prompt([
      {
        type: 'password',
        name: 'value',
        message: `Enter value for ${name}:`,
        mask: '*'
      }
    ])

    // Store the secret
    await storage.set(name, value)

    console.log(chalk.green(`✓ Secret "${name}" stored successfully`))
  })
```

#### Task 5.3: List Command
**File:** `src/cli/commands/list.ts`

```typescript
import { Command } from 'commander'
import chalk from 'chalk'
import { createStorage } from '../../storage'

export const listCommand = new Command('list')
  .description('List all secrets (metadata only)')
  .action(async () => {
    const storage = await createStorage()
    const secrets = await storage.list()

    if (secrets.length === 0) {
      console.log(chalk.yellow('No secrets stored'))
      return
    }

    console.log(chalk.bold('Stored Secrets:'))
    for (const name of secrets) {
      console.log(`  ${chalk.cyan(name)}`)
      // Never show values, only metadata
    }
    console.log(`\nTotal: ${secrets.length}`)
  })
```

#### Task 5.4: Remove Command
**File:** `src/cli/commands/remove.ts`

```typescript
import { Command } from 'commander'
import inquirer from 'inquirer'
import chalk from 'chalk'
import { createStorage } from '../../storage'

export const removeCommand = new Command('remove')
  .description('Remove a secret')
  .argument('<name>', 'Secret name')
  .option('-f, --force', 'Skip confirmation')
  .action(async (name, options) => {
    const storage = await createStorage()

    if (!await storage.has(name)) {
      console.log(chalk.yellow(`Secret "${name}" does not exist`))
      return
    }

    if (!options.force) {
      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `Remove secret "${name}"?`,
          default: false
        }
      ])

      if (!confirm) {
        console.log(chalk.gray('Cancelled'))
        return
      }
    }

    await storage.delete(name)
    console.log(chalk.green(`✓ Secret "${name}" removed`))
  })
```

#### Task 5.5: Rotate Command
**File:** `src/cli/commands/rotate.ts`

```typescript
import { Command } from 'commander'
import inquirer from 'inquirer'
import chalk from 'chalk'
import { createStorage } from '../../storage'

export const rotateCommand = new Command('rotate')
  .description('Rotate a secret value')
  .argument('<name>', 'Secret name')
  .action(async (name) => {
    const storage = await createStorage()

    if (!await storage.has(name)) {
      console.log(chalk.yellow(`Secret "${name}" does not exist`))
      return
    }

    const { newValue } = await inquirer.prompt([
      {
        type: 'password',
        name: 'newValue',
        message: `Enter new value for ${name}:`,
        mask: '*'
      }
    ])

    await storage.set(name, newValue)
    console.log(chalk.green(`✓ Secret "${name}" rotated successfully`))
  })
```

#### Task 5.6: Serve Command
**File:** `src/cli/commands/serve.ts`

```typescript
import { Command } from 'commander'
import chalk from 'chalk'
import { createStorage } from '../../storage'
import { startServer } from '../../web'

export const serveCommand = new Command('serve')
  .description('Start web UI server')
  .option('-p, --port <port>', 'Port number', '3000')
  .option('-H, --host <host>', 'Host address', 'localhost')
  .option('--tls', 'Enable HTTPS')
  .option('--cert <path>', 'TLS certificate path')
  .option('--key <path>', 'TLS key path')
  .action(async (options) => {
    const storage = await createStorage()

    console.log(chalk.cyan(`🦀 ClawVault Web UI`))
    console.log(chalk.gray(`Starting server on ${options.host}:${options.port}`))

    const webOptions = {
      port: parseInt(options.port),
      host: options.host,
      ...(options.tls && {
        tls: {
          cert: options.cert,
          key: options.key
        }
      })
    }

    await startServer(storage, webOptions)

    console.log(chalk.green(`✓ Server running`))
    console.log(chalk.gray(`Submit secrets at http${options.tls ? 's' : ''}://${options.host}:${options.port}`))
  })
```

### Verification Checklist Phase 5

```bash
# CLI tests
npm test test/unit/cli/

# Test each command
npm start add OPENAI_API_KEY
npm start list
npm start remove TEST_KEY
npm start serve

# Verify CLI never exposes values in help/error
npm start --help | grep -i value
```

**Success criteria:**
- [ ] All commands work correctly
- [ ] Interactive prompts use hidden input
- [ ] List command shows metadata only
- [ ] CLI tests pass
- [ ] Security tests pass (no value in errors)

---

## Phase 6: Cross-Platform Support

### What to Implement

#### Task 6.1: macOS Keychain Provider
**File:** `src/storage/providers/macos.ts`

```typescript
import { exec } from 'child_process'
import { promisify } from 'util'
import { StorageProvider } from '../interfaces'

const execAsync = promisify(exec)

const ACCOUNT = 'clawvault'

export class MacOSKeychainProvider implements StorageProvider {
  async set(name: string, value: string): Promise<void> {
    // security add-generic-password -a clawvault -s SECRET_NAME -w VALUE
    const cmd = `security add-generic-password -a "${ACCOUNT}" -s "${name}" -w "${value}" -D "ClawVault secret"`
    await execAsync(cmd)
  }

  async get(name: string): Promise<string | null> {
    try {
      // security find-generic-password -a clawvault -s SECRET_NAME -w
      const { stdout } = await execAsync(`security find-generic-password -a "${ACCOUNT}" -s "${name}" -w 2>/dev/null`)
      return stdout.trim() || null
    } catch {
      return null
    }
  }

  async delete(name: string): Promise<void> {
    // security delete-generic-password -a clawvault -s SECRET_NAME
    await execAsync(`security delete-generic-password -a "${ACCOUNT}" -s "${name}" 2>/dev/null || true`)
  }

  async list(): Promise<string[]> {
    try {
      // List all items for clawvault account
      const { stdout } = await execAsync(`security dump-keychain | grep "clawvault" | awk -F'"' '{print $4}'`)
      return stdout.split('\n').filter(Boolean)
    } catch {
      return []
    }
  }

  async has(name: string): Promise<boolean> {
    const val = await this.get(name)
    return val !== null
  }
}
```

#### Task 6.2: Windows Credential Manager Provider
**File:** `src/storage/providers/windows.ts`

```typescript
import { exec } from 'child_process'
import { promisify } from 'util'
import { StorageProvider } from '../interfaces'

const execAsync = promisify(exec)

const TARGET = 'clawvault'

export class WindowsCredentialManager implements StorageProvider {
  async set(name: string, value: string): Promise<void> {
    // cmdkey /generic:clawvault /user:SECRET_NAME /pass:VALUE
    await execAsync(`cmdkey /generic:${TARGET} /user:${name} /pass:${value}`)
  }

  async get(name: string): Promise<string | null> {
    try {
      // cmdkey doesn't have a direct get, use PowerShell
      const psCmd = `
        cmdkey /list:${TARGET} 2>$null |
        Select-String "Target: ${TARGET}" -Context 0,10 |
        ForEach-Object {
          if ($_ -match "user: ${name}") {
            $_.Context.PostContext | Select-String "pass:" |
            ForEach-Object { ($_ -split "pass: ")[1].Trim() }
          }
        }
      `
      const { stdout } = await execAsync(`powershell -Command "${psCmd}"`)
      return stdout.trim() || null
    } catch {
      return null
    }
  }

  async delete(name: string): Promise<void> {
    // cmdkey /delete:clawvault /user:SECRET_NAME
    await execAsync(`cmdkey /delete:${TARGET} /user:${name} 2>$null || true`)
  }

  async list(): Promise<string[]> {
    try {
      const { stdout } = await execAsync(`cmdkey /list:${TARGET} 2>$null`)
      // Parse output for user names
      return this.parseCmdkeyList(stdout)
    } catch {
      return []
    }
  }

  async has(name: string): Promise<boolean> {
    const val = await this.get(name)
    return val !== null
  }

  private parseCmdkeyList(output: string): string[] {
    const lines = output.split('\n')
    const names: string[] = []
    for (const line of lines) {
      const match = line.match(/user:\s*(.+)/)
      if (match) {
        names.push(match[1].trim())
      }
    }
    return names
  }
}
```

#### Task 6.3: Update Storage Factory
**File:** `src/storage/index.ts`

Update the `createStorage` function:

```typescript
import { detectPlatform } from './platform'
import { LinuxKeyringProvider } from './providers/linux'
import { MacOSKeychainProvider } from './providers/macos'
import { WindowsCredentialManager } from './providers/windows'
import { FallbackProvider } from './providers/fallback'
import { StorageProvider } from './interfaces'

export async function createStorage(): Promise<StorageProvider> {
  const platform = await detectPlatform()

  switch (platform.provider) {
    case 'linux':
      return new LinuxKeyringProvider()
    case 'macos':
      return new MacOSKeychainProvider()
    case 'windows':
      return new WindowsCredentialManager()
    case 'fallback':
      return new FallbackProvider()
    default:
      return new FallbackProvider()
  }
}
```

### Verification Checklist Phase 6

```bash
# Cross-platform tests
npm test test/integration/cross-platform.ts

# On macOS: test keychain commands
security add-generic-password -a clawvault -s TEST -w "test"
security find-generic-password -a clawvault -s TEST -w
security delete-generic-password -a clawvault -s TEST

# On Windows: test cmdkey
cmdkey /generic:clawvault /user:TEST /pass:test
cmdkey /list:clawvault
cmdkey /delete:clawvault /user:TEST
```

**Success criteria:**
- [ ] Works on macOS (Keychain)
- [ ] Works on Windows (Credential Manager)
- [ ] Fallback storage works with warning
- [ ] Cross-platform tests pass

---

## Phase 7: Polish & Documentation

### What to Implement

#### Task 7.1: Security Documentation
**File:** `docs/SECURITY.md`

```markdown
# ClawVault Security Model

## What We Protect

- Secrets are stored encrypted at rest using platform-native keyrings
- Secrets are never logged, never included in error messages
- Secrets bypass AI context entirely
- Web UI submits directly to keyring, never through AI

## What We Don't Protect

- Secrets in gateway process environment can be exposed via process inspection
- Web UI runs over HTTP by default (use --tls for production)
- Fallback storage uses file encryption (weaker than platform keyring)

## Threat Model

### Protected Against
- AI context logging
- Config file exposure
- Shell history (via hidden input)
- Log aggregation capturing secrets

### Not Protected Against
- Memory dump of gateway process
- Compromised machine with keyring access
- Network interception without TLS
```

#### Task 7.2: API Documentation
**File:** `docs/API.md`

```markdown
# ClawVault API

## StorageProvider Interface

\`\`\`typescript
interface StorageProvider {
  set(name: string, value: string): Promise<void>
  get(name: string): Promise<string | null>
  delete(name: string): Promise<void>
  list(): Promise<string[]>
  has(name: string): Promise<boolean>
}
\`\`\`

## CLI Commands

\`\`\`bash
clawvault add <name>          # Add a secret
clawvault list               # List secrets (metadata only)
clawvault remove <name>      # Remove a secret
clawvault rotate <name>      # Rotate a secret value
clawvault serve [options]    # Start web UI
\`\`\`

## Web API

\`\`\`
POST /api/submit    # Submit a secret
GET  /api/status    # List stored secrets (metadata)
GET  /              # Web form
\`\`\`
```

#### Task 7.3: ClawHub Skill Manifest
**File:** `.clawhub/SKILL.md`

```markdown
# ClawVault Skill

Secure secret management for OpenClaw.

## Description

ClawVault stores secrets in OS-native encrypted keyrings and injects them into the OpenClaw Gateway environment. Secrets NEVER enter AI context.

## Commands

- \`clawvault add <name>\` - Add a secret
- \`clawvault list\` - List secrets
- \`clawvault serve\` - Start web UI

## Integration

Secrets are automatically injected into gateway environment on restart.
```

### Verification Checklist Phase 7

```bash
# Documentation review
grep -r "NEVER" docs/ .clawhub/

# Final test suite
npm test

# Build verification
npm run build

# Security audit
npm audit
grep -r "secret.*value" src/ | grep -v "// " | grep "log\|console\|return"
```

**Success criteria:**
- [ ] All documentation complete
- [ ] Security audit passed
- [ ] Integration tests pass
- [ ] Skill manifest complete
- [ ] Ready for ClawHub publication

---

## Final Verification Phase

### Complete Test Suite

```bash
# Unit tests
npm test test/unit/

# Integration tests
npm test test/integration/

# Security tests (CRITICAL)
npm test test/security/

# Type checking
npx tsc --noEmit

# Linting
npm run lint

# Build
npm run build
```

### Anti-Pattern Checks

```bash
# Ensure secret values never in logs
grep -r "console.log.*value" src/
grep -r "console.log.*secret" src/

# Ensure get() not exposed in public API
grep -r "export.*get" src/

# Ensure no hardcoded secrets
grep -r "sk-" src/
grep -r "Bearer" src/
```

### Success Criteria Summary

- [ ] All 7 phases complete
- [ ] All tests passing (>90% coverage)
- [ ] TypeScript compilation clean
- [ ] No security violations
- [ ] Documentation complete
- [ ] Ready for ClawHub publication

---

## Team Execution Plan

### Recommended Team Structure

1. **Team Lead (orchestrator)** - Coordinates phases, handles merge decisions
2. **Storage Team** - Phases 1 & 6 (storage layer)
3. **Config Team** - Phase 2 (configuration system)
4. **Gateway Team** - Phase 3 (gateway integration)
5. **Web Team** - Phase 4 (web UI)
6. **CLI Team** - Phase 5 (command-line interface)
7. **Docs Team** - Phase 7 (documentation and polish)

### Phase Dependencies

```
Phase 1 (Storage) ─────┐
                       ├───► Phase 3 (Gateway)
Phase 2 (Config)   ────┘          │
                                   │
Phase 4 (Web) ─────────────────────┤
                                   │
Phase 5 (CLI) ◄────────────────────┘
      │
      └───► Phase 6 (Cross-platform)
              │
              └───► Phase 7 (Polish)
```

### Parallel Execution Opportunities

- **Phase 1 + Phase 2** can run in parallel (storage + config independent)
- **Phase 4 + Phase 5** can run in parallel after Phase 1
- **Phase 6** can start after Phase 1, parallel to other phases

---

**This plan is ready for execution.** Start with Phase 0 (already complete), then proceed sequentially through Phases 1-7.
