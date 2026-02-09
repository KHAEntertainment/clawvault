/**
 * Systemd Service Manager
 *
 * Manages OpenClaw Gateway systemd user service for secret injection.
 * Handles environment import, service restart, and status checks.
 */

import { execFile } from 'child_process'
import { promisify } from 'util'
import { SECRET_NAME_PATTERN } from '../config/schemas.js'

const execFileAsync = promisify(execFile)
const SYSTEMD_SERVICE_PATTERN = /^[a-zA-Z0-9_.@:-]+\.service$/

function sanitizeEnvVars(envVars: string[]): string[] {
  const invalid = envVars.filter(v => !SECRET_NAME_PATTERN.test(v))
  if (invalid.length > 0) {
    throw new SystemdError(`Invalid environment variable names: ${invalid.join(', ')}`)
  }
  return envVars
}

function sanitizeServiceName(serviceName: string): string {
  if (!SYSTEMD_SERVICE_PATTERN.test(serviceName)) {
    throw new SystemdError(`Invalid service name: ${serviceName}`, serviceName)
  }
  return serviceName
}

async function execSystemctl(args: string[]): Promise<void> {
  await execFileAsync('systemctl', args)
}

async function execSystemctlCapture(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('systemctl', args)
  return stdout
}

export interface GatewayService {
  name: string
  isActive: boolean
  needsRestart: boolean
}

export interface ServiceStatus {
  name: string
  active: boolean
  enabled: boolean
  status: 'active' | 'inactive' | 'failed' | 'unknown'
}

export class SystemdError extends Error {
  public readonly service?: string

  constructor(message: string, service?: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined)
    this.name = 'SystemdError'
    this.service = service
  }
}

export class SystemdManager {
  private readonly userFlag = '--user'

  async importEnvironment(envVars: string[]): Promise<void> {
    if (envVars.length === 0) {
      return
    }

    const safeVars = sanitizeEnvVars(envVars)

    try {
      await execSystemctl([this.userFlag, 'import-environment', ...safeVars])
    } catch (error: unknown) {
      throw new SystemdError(
        `Failed to import environment to systemd: ${safeVars.join(' ')}`,
        undefined,
        error
      )
    }
  }

  async importSingleEnvironment(envVar: string): Promise<void> {
    await this.importEnvironment([envVar])
  }

  async restartService(serviceName: string, stopDelay = 2000, startDelay = 5000): Promise<void> {
    const safeService = sanitizeServiceName(serviceName)

    try {
      await execSystemctl([this.userFlag, 'stop', safeService])
    } catch {
      // ignore
    }

    await this.delay(stopDelay)

    try {
      await execSystemctl([this.userFlag, 'start', safeService])
    } catch (error: unknown) {
      throw new SystemdError(`Failed to start service: ${safeService}`, safeService, error)
    }

    await this.delay(startDelay)

    if (!(await this.isServiceActiveUnchecked(safeService))) {
      throw new SystemdError(`Service did not start cleanly: ${safeService}`, safeService)
    }
  }

  private async isServiceActiveUnchecked(serviceName: string): Promise<boolean> {
    try {
      await execSystemctl([this.userFlag, 'is-active', '--quiet', serviceName])
      return true
    } catch {
      return false
    }
  }

  private async isServiceEnabledUnchecked(serviceName: string): Promise<boolean> {
    try {
      await execSystemctl([this.userFlag, 'is-enabled', '--quiet', serviceName])
      return true
    } catch {
      return false
    }
  }

  async isServiceActive(serviceName: string): Promise<boolean> {
    const safeService = sanitizeServiceName(serviceName)
    return this.isServiceActiveUnchecked(safeService)
  }

  async isServiceEnabled(serviceName: string): Promise<boolean> {
    const safeService = sanitizeServiceName(serviceName)
    return this.isServiceEnabledUnchecked(safeService)
  }

  async getStatus(serviceName: string): Promise<string> {
    const safeService = sanitizeServiceName(serviceName)

    try {
      return await execSystemctlCapture([this.userFlag, 'status', safeService])
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'stdout' in error && typeof error.stdout === 'string') {
        return error.stdout
      }
      throw new SystemdError(`Failed to get status for: ${safeService}`, safeService, error)
    }
  }

  async getServiceStatus(serviceName: string): Promise<ServiceStatus> {
    const safeService = sanitizeServiceName(serviceName)
    const active = await this.isServiceActiveUnchecked(safeService)
    const enabled = await this.isServiceEnabledUnchecked(safeService)

    let status: ServiceStatus['status'] = 'unknown'
    if (active) {
      status = 'active'
    } else {
      try {
        const stdout = await execSystemctlCapture([this.userFlag, 'is-failed', safeService])
        status = stdout.trim() === 'failed' ? 'failed' : 'inactive'
      } catch {
        status = 'inactive'
      }
    }

    return {
      name: safeService,
      active,
      enabled,
      status
    }
  }

  async stopService(serviceName: string): Promise<void> {
    const safeService = sanitizeServiceName(serviceName)
    try {
      await execSystemctl([this.userFlag, 'stop', safeService])
    } catch (error: unknown) {
      throw new SystemdError(`Failed to stop service: ${safeService}`, safeService, error)
    }
  }

  async startService(serviceName: string): Promise<void> {
    const safeService = sanitizeServiceName(serviceName)
    try {
      await execSystemctl([this.userFlag, 'start', safeService])
    } catch (error: unknown) {
      throw new SystemdError(`Failed to start service: ${safeService}`, safeService, error)
    }
  }

  async enableService(serviceName: string): Promise<void> {
    const safeService = sanitizeServiceName(serviceName)
    try {
      await execSystemctl([this.userFlag, 'enable', safeService])
    } catch (error: unknown) {
      throw new SystemdError(`Failed to enable service: ${safeService}`, safeService, error)
    }
  }

  async disableService(serviceName: string): Promise<void> {
    const safeService = sanitizeServiceName(serviceName)
    try {
      await execSystemctl([this.userFlag, 'disable', safeService])
    } catch (error: unknown) {
      throw new SystemdError(`Failed to disable service: ${safeService}`, safeService, error)
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

export function createSystemdManager(): SystemdManager {
  return new SystemdManager()
}
