# ClawVault API Documentation

## Table of Contents

- [Storage Provider API](#storage-provider-api)
- [Configuration API](#configuration-api)
- [Gateway Integration API](#gateway-integration-api)
- [CLI Commands](#cli-commands)
- [Web API Endpoints](#web-api-endpoints)
- [Library Usage](#library-usage)

---

## Storage Provider API

The storage layer provides a unified interface for platform-specific keyring operations.

### Interface

```typescript
interface StorageProvider {
  /**
   * Store a secret value in the keyring
   * @param name - Secret name (e.g., OPENAI_API_KEY)
   * @param value - Secret value (never logged)
   */
  set(name: string, value: string): Promise<void>

  /**
   * Retrieve a secret value from the keyring
   * INTERNAL USE ONLY - never expose to AI context
   * @param name - Secret name
   * @returns Secret value or null if not found
   */
  get(name: string): Promise<string | null>

  /**
   * Delete a secret from the keyring
   * @param name - Secret name
   */
  delete(name: string): Promise<void>

  /**
   * List all secret names in the keyring
   * @returns Array of secret names (values never included)
   */
  list(): Promise<string[]>

  /**
   * Check if a secret exists in the keyring
   * @param name - Secret name
   * @returns true if secret exists
   */
  has(name: string): Promise<boolean>
}
```

### Storage Factory

```typescript
import { createStorage, detectPlatform } from 'clawvault/storage'

// Create storage provider (auto-detects platform)
const storage = await createStorage()

// Detect platform information
const platformInfo = await detectPlatform()
// Returns: { platform: 'linux', hasKeyring: true, provider: 'linux' }
```

### Platform-Specific Providers

```typescript
import {
  LinuxKeyringProvider,
  MacOSKeychainProvider,
  WindowsCredentialManager,
  FallbackProvider
} from 'clawvault/storage'

// Direct instantiation (not recommended - use factory)
const linux = new LinuxKeyringProvider()
const macos = new MacOSKeychainProvider()
const windows = new WindowsCredentialManager()
const fallback = new FallbackProvider()
```

---

## Configuration API

The configuration API manages secret definitions and gateway settings.

### Loading and Saving

```typescript
import {
  loadConfig,
  saveConfig,
  configExists,
  getConfigPath,
  createDefaultConfig
} from 'clawvault/config'

// Load configuration (creates default if missing)
const config = await loadConfig()

// Save configuration
await saveConfig(config)

// Check if config exists
const exists = await configExists()

// Get config file path
const path = getConfigPath() // ~/.config/clawvault/secrets.json

// Create default config
await createDefaultConfig()
```

### Secret Definition Management

```typescript
import {
  addSecretDefinition,
  removeSecretDefinition,
  getSecretDefinition
} from 'clawvault/config'

// Add or update a secret definition
await addSecretDefinition('MY_API_KEY', {
  description: 'My Service API key',
  environmentVar: 'MY_API_KEY',
  provider: 'myservice',
  required: false,
  gateways: ['main']
})

// Remove a secret definition
const removed = await removeSecretDefinition('MY_API_KEY')

// Get a secret definition
const definition = await getSecretDefinition('OPENAI_API_KEY')
```

### Validation

```typescript
import {
  validateConfig,
  validateConfigDetailed,
  validateSecretName,
  SECRET_NAME_PATTERN
} from 'clawvault/config'

// Type guard validation
if (validateConfig(unknownConfig)) {
  // config is now typed as ConfigSchema
}

// Detailed validation with errors
const result = validateConfigDetailed(unknownConfig)
if (!result.valid) {
  console.error(result.errors)
  // [{ path: 'secrets.INVALID_NAME', message: 'Invalid secret name format' }]
}

// Validate a secret name
if (validateSecretName('OPENAI_API_KEY')) {
  // Valid name
}

// Secret name pattern
SECRET_NAME_PATTERN.test('OPENAI_API_KEY') // true
SECRET_NAME_PATTERN.test('invalid-name')   // false
```

### Configuration Schema

```typescript
interface ConfigSchema {
  version: number
  secrets: Record<string, SecretDefinitionSchema>
  gateway: GatewayConfigSchema
}

interface SecretDefinitionSchema {
  description: string
  environmentVar: string
  provider: string
  required: boolean
  gateways: string[]
  rotation?: RotationSchema
  validation?: ValidationSchema
}

interface GatewayConfigSchema {
  restartOnUpdate: boolean
  services: string[]
}

interface RotationSchema {
  enabled: boolean
  maxAgeDays?: number
  intervalDays?: number
}

interface ValidationSchema {
  pattern?: string
  minLength?: number
  maxLength?: number
}
```

---

## Gateway Integration API

The gateway integration API handles environment injection and service management.

### Main Injection

```typescript
import { injectToGateway } from 'clawvault/gateway'

const storage = await createStorage()
const config = await loadConfig()

// Inject secrets into gateway
const result = await injectToGateway(storage, config, {
  skipRestart: false,
  restartDelay: 2000
})

// Result format
// {
//   injected: ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY'],
//   skipped: ['GEMINI_API_KEY'],
//   servicesRestarted: ['openclaw-gateway.service'],
//   totalCount: 3
// }
```

### Single Secret Injection

```typescript
import { injectSingleSecret } from 'clawvault/gateway'

const storage = await createStorage()

// Inject a single secret
const injected = await injectSingleSecret(
  storage,
  'OPENAI_API_KEY',
  'OPENAI_API_KEY' // env var name (optional, defaults to secret name)
)

// Returns: true if injected, false if not found
```

### Service Management

```typescript
import {
  restartGatewayServices,
  checkGatewayServices,
  getGatewayServiceStatuses
} from 'clawvault/gateway'

const config = await loadConfig()

// Restart gateway services
const restarted = await restartGatewayServices(config)
// Returns: ['openclaw-gateway.service']

// Check if services are active
const activeStatus = await checkGatewayServices(config)
// Returns: { 'openclaw-gateway.service': true }

// Get detailed service status
const statuses = await getGatewayServiceStatuses(config)
// Returns: [
//   { name: 'openclaw-gateway.service', active: true, enabled: true }
// ]
```

### Systemd Manager

```typescript
import { SystemdManager, createSystemdManager } from 'clawvault/gateway'

const systemd = new SystemdManager()

// Import environment variables
await systemd.importEnvironment(['OPENAI_API_KEY', 'ANTHROPIC_API_KEY'])

// Restart a service
await systemd.restartService('openclaw-gateway.service', 2000)

// Check if service is active
const isActive = await systemd.isServiceActive('openclaw-gateway.service')

// Get service status
const status = await systemd.getServiceStatus('openclaw-gateway.service')
// Returns: { active: true, enabled: true, running: true }
```

### Environment Injection

```typescript
import {
  injectSecrets,
  injectSecretsWithConfig,
  injectIntoProcess,
  exportToSystemdCommand
} from 'clawvault/gateway'

const storage = await createStorage()

// Simple injection (env var = secret name)
const result = await injectSecrets(storage, ['OPENAI_API_KEY'])
// Returns: { env: { OPENAI_API_KEY: 'sk-...' }, injected: ['OPENAI_API_KEY'], ... }

// Injection with config mapping
const result = await injectSecretsWithConfig(
  storage,
  ['OPENAI_API_KEY'],
  { OPENAI_API_KEY: 'MY_CUSTOM_ENV_VAR' }
)

// Inject into current process
injectIntoProcess({ OPENAI_API_KEY: 'sk-...' })

// Generate systemd command
const cmd = exportToSystemdCommand(['OPENAI_API_KEY', 'ANTHROPIC_API_KEY'])
// Returns: 'systemctl --user import-environment OPENAI_API_KEY ANTHROPIC_API_KEY'
```

---

## CLI Commands

### Installation

```bash
npm install -g clawvault
# or
npm link clawvault  # for development
```

### Commands Reference

#### add

Add a new secret to the keyring.

```bash
clawvault add <name> [options]

# Arguments:
#   name              Secret name (e.g., OPENAI_API_KEY)

# Options:
#   -p, --provider <provider>   Service provider (e.g., openai, anthropic)
#   -e, --env <var>             Environment variable name
```

**Examples:**
```bash
# Add OpenAI API key
clawvault add OPENAI_API_KEY -p openai

# Add custom secret with specific env var
clawvault add MY_API_KEY -p myservice -e CUSTOM_API_KEY
```

#### list

List all secrets (metadata only).

```bash
clawvault list
```

**Output:**
```
Stored Secrets:

  OPENAI_API_KEY
    Description: OpenAI API key for GPT models
    Provider: openai

  ANTHROPIC_API_KEY
    Description: Anthropic API key for Claude models
    Provider: anthropic

Total: 2 secrets
```

#### remove

Remove a secret from the keyring.

```bash
clawvault remove <name> [options]

# Arguments:
#   name              Secret name

# Options:
#   -f, --force       Skip confirmation
```

**Examples:**
```bash
# Remove with confirmation
clawvault remove TEST_KEY

# Remove without confirmation
clawvault remove TEST_KEY --force
```

#### rotate

Rotate a secret value (update without removing definition).

```bash
clawvault rotate <name>

# Arguments:
#   name              Secret name to rotate
```

#### serve

Start the web UI server.

```bash
clawvault serve [options]

# Options:
#   -p, --port <port>         Port number (default: 3000)
#   -H, --host <host>         Host address (default: localhost)
#   --tls                     Enable HTTPS
#   --cert <path>             TLS certificate path
#   --key <path>              TLS private key path
```

**Examples:**
```bash
# Default HTTP server on localhost:3000
clawvault serve

# HTTPS server
clawvault serve --tls --cert ./cert.pem --key ./key.pem

# Custom host and port
clawvault serve --host 0.0.0.0 --port 8080
```

---

## Web API Endpoints

### Base URL

Default: `http://localhost:3000`

### POST /api/submit

Store a new secret in the keyring.

**Request:**
```http
POST /api/submit
Content-Type: application/json

{
  "secretName": "OPENAI_API_KEY",
  "secretValue": "sk-...",
  "description": "OpenAI API key"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Secret \"OPENAI_API_KEY\" stored successfully",
  "metadata": {
    "name": "OPENAI_API_KEY",
    "length": 51,
    "description": "OpenAI API key"
  }
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "Missing or invalid secretName"
}
```

### GET /api/status

List stored secrets (metadata only).

**Request:**
```http
GET /api/status
```

**Response:**
```json
{
  "status": "ok",
  "secrets": [
    { "name": "OPENAI_API_KEY" },
    { "name": "ANTHROPIC_API_KEY" }
  ],
  "count": 2,
  "timestamp": 1705310400000
}
```

### GET /health

Health check endpoint.

**Request:**
```http
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": 1705310400000
}
```

### GET /

Serve the secret submission form (HTML).

**Request:**
```http
GET /
```

**Response:** HTML form for secret submission

---

## Library Usage

### Basic Usage

```typescript
import { createStorage } from 'clawvault/storage'

async function main() {
  const storage = await createStorage()

  // Store a secret
  await storage.set('MY_SECRET', 'secret-value')

  // Check if exists
  const exists = await storage.has('MY_SECRET')

  // List all secrets
  const secrets = await storage.list()

  // Delete a secret
  await storage.delete('MY_SECRET')
}
```

### Gateway Integration

```typescript
import { createStorage } from 'clawvault/storage'
import { loadConfig } from 'clawvault/config'
import { injectToGateway } from 'clawvault/gateway'

async function injectSecrets() {
  const storage = await createStorage()
  const config = await loadConfig()

  const result = await injectToGateway(storage, config)

  console.log(`Injected: ${result.injected.join(', ')}`)
  console.log(`Restarted: ${result.servicesRestarted.join(', ')}`)
}
```

### Web Server

```typescript
import { createStorage } from 'clawvault/storage'
import { startServer } from 'clawvault/web'

async function startWebUI() {
  const storage = await createStorage()

  await startServer(storage, {
    port: 3000,
    host: 'localhost'
    // Optional: tls: { cert: './cert.pem', key: './key.pem' }
  })

  console.log('Web UI running on http://localhost:3000')
}
```

### Error Handling

```typescript
import {
  ConfigValidationError,
  ConfigReadError,
  ConfigWriteError
} from 'clawvault/config'

import {
  GatewayInjectionError,
  SystemdError
} from 'clawvault/gateway'

try {
  const config = await loadConfig()
} catch (error) {
  if (error instanceof ConfigValidationError) {
    console.error('Invalid config:', error.message)
  } else if (error instanceof ConfigReadError) {
    console.error('Cannot read config:', error.message, error.cause)
  }
}

try {
  await injectToGateway(storage, config)
} catch (error) {
  if (error instanceof GatewayInjectionError) {
    console.error('Injection failed:', error.message, error.cause)
  }
}
```

## TypeScript Types

All types are exported for use in TypeScript projects:

```typescript
import type {
  StorageProvider,
  PlatformInfo,
  ConfigSchema,
  SecretDefinitionSchema,
  GatewayConfigSchema,
  EnvironmentInjection,
  InjectionResult,
  GatewayInjectionResult,
  GatewayService,
  ServiceStatus
} from 'clawvault'
```
