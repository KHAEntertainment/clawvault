/**
 * Systemd Service Manager
 *
 * Manages OpenClaw Gateway systemd user service for secret injection.
 * Handles environment import, service restart, and status checks.
 *
 * Reference: reference-secret-manager.sh lines 171-199
 *
 * SECURITY: Secret values are passed to systemctl import-environment
 * but never logged. Only environment variable names are logged.
 */

import { exec } from 'child_process'
import { promisify } from 'util'

/**
 * Helper to exec a command and ignore output.
 */
async function execQuiet(command: string): Promise<void> {
  await promisify(exec)(command, { encoding: 'utf-8' })
}

/**
 * Helper to exec a command and get stdout.
 */
async function execCapture(command: string): Promise<string> {
  const { stdout } = await promisify(exec)(command, { encoding: 'utf-8' })
  return stdout
}

/**
 * Information about a gateway service.
 */
export interface GatewayService {
  name: string
  isActive: boolean
  needsRestart: boolean
}

/**
 * Result of service status check.
 */
export interface ServiceStatus {
  name: string
  active: boolean
  enabled: boolean
  status: 'active' | 'inactive' | 'failed' | 'unknown'
}

/**
 * Error thrown when systemd operations fail.
 */
export class SystemdError extends Error {
  constructor(
    message: string,
    public readonly service?: string,
    public readonly cause?: unknown
  ) {
    super(message)
    this.name = 'SystemdError'
  }
}

/**
 * Manager for systemd user services.
 *
 * Provides methods to interact with systemd user services
 * for the OpenClaw Gateway integration.
 */
export class SystemdManager {
  private readonly userFlag = '--user'

  /**
   * Import environment variables into the systemd user session.
   *
   * This makes the environment variables available to systemd
   * services started by the user session.
   *
   * Reference: systemctl --user import-environment VAR1 VAR2 ...
   *
   * @param envVars - Array of environment variable names to import
   * @throws SystemdError if import fails
   */
  async importEnvironment(envVars: string[]): Promise<void> {
    if (envVars.length === 0) {
      return // Nothing to import
    }

    const vars = envVars.join(' ')

    try {
      // Import environment variables to systemd user session
      await execQuiet(`systemctl ${this.userFlag} import-environment ${vars}`)
    } catch (error: unknown) {
      throw new SystemdError(
        `Failed to import environment to systemd: ${vars}`,
        undefined,
        error
      )
    }
  }

  /**
   * Import a single environment variable.
   *
   * Convenience method for importing a single variable.
   *
   * @param envVar - Environment variable name to import
   * @throws SystemdError if import fails
   */
  async importSingleEnvironment(envVar: string): Promise<void> {
    await this.importEnvironment([envVar])
  }

  /**
   * Restart a systemd user service.
   *
   * Performs a graceful restart with timing delays to ensure
   * the service stops completely before starting again.
   *
   * Reference: reference-secret-manager.sh lines 177-192
   *
   * @param serviceName - Name of the service (e.g., 'openclaw-gateway.service')
   * @param stopDelay - Delay in ms after stop before start (default: 2000)
   * @param startDelay - Delay in ms after start before returning (default: 5000)
   * @throws SystemdError if restart fails
   */
  async restartService(
    serviceName: string,
    stopDelay = 2000,
    startDelay = 5000
  ): Promise<void> {
    try {
      // Stop the service (ignore errors if not running)
      await execQuiet(`systemctl ${this.userFlag} stop ${serviceName}`)
    } catch {
      // Service may not have been running - continue
    }

    // Wait for service to fully stop
    await this.delay(stopDelay)

    try {
      // Start the service
      await execQuiet(`systemctl ${this.userFlag} start ${serviceName}`)
    } catch (error: unknown) {
      throw new SystemdError(
        `Failed to start service: ${serviceName}`,
        serviceName,
        error
      )
    }

    // Wait for service to fully start
    await this.delay(startDelay)

    // Verify service started successfully
    if (!(await this.isServiceActive(serviceName))) {
      throw new SystemdError(
        `Service did not start cleanly: ${serviceName}`,
        serviceName
      )
    }
  }

  /**
   * Check if a systemd user service is currently active.
   *
   * Uses systemctl is-active --quiet which exits with 0 if active.
   *
   * @param serviceName - Name of the service to check
   * @returns true if the service is active
   */
  async isServiceActive(serviceName: string): Promise<boolean> {
    try {
      await execQuiet(`systemctl ${this.userFlag} is-active --quiet ${serviceName}`)
      return true
    } catch {
      return false
    }
  }

  /**
   * Check if a systemd user service is enabled.
   *
   * @param serviceName - Name of the service to check
   * @returns true if the service is enabled
   */
  async isServiceEnabled(serviceName: string): Promise<boolean> {
    try {
      await execQuiet(`systemctl ${this.userFlag} is-enabled --quiet ${serviceName}`)
      return true
    } catch {
      return false
    }
  }

  /**
   * Get detailed status of a systemd user service.
   *
   * Returns the full status output from systemctl status.
   *
   * @param serviceName - Name of the service
   * @returns Full status text output
   * @throws SystemdError if status cannot be retrieved
   */
  async getStatus(serviceName: string): Promise<string> {
    try {
      return await execCapture(`systemctl ${this.userFlag} status ${serviceName}`)
    } catch (error: unknown) {
      // systemctl status returns non-zero for inactive services
      // but still outputs the status, so check if we have stdout
      if (
        error &&
        typeof error === 'object' &&
        'stdout' in error &&
        typeof error.stdout === 'string'
      ) {
        return error.stdout
      }
      throw new SystemdError(
        `Failed to get status for: ${serviceName}`,
        serviceName,
        error
      )
    }
  }

  /**
   * Get parsed service status information.
   *
   * Returns a structured status object with active/enabled state.
   *
   * @param serviceName - Name of the service
   * @returns Structured service status
   */
  async getServiceStatus(serviceName: string): Promise<ServiceStatus> {
    const active = await this.isServiceActive(serviceName)
    const enabled = await this.isServiceEnabled(serviceName)

    let status: ServiceStatus['status'] = 'unknown'
    if (active) {
      status = 'active'
    } else {
      // Check if it's failed or just inactive
      try {
        const stdout = await execCapture(`systemctl ${this.userFlag} is-failed ${serviceName}`)
        status = stdout.trim() === 'failed' ? 'failed' : 'inactive'
      } catch {
        status = 'inactive'
      }
    }

    return {
      name: serviceName,
      active,
      enabled,
      status
    }
  }

  /**
   * Stop a systemd user service without restarting.
   *
   * @param serviceName - Name of the service to stop
   * @throws SystemdError if stop fails
   */
  async stopService(serviceName: string): Promise<void> {
    try {
      await execQuiet(`systemctl ${this.userFlag} stop ${serviceName}`)
    } catch (error: unknown) {
      throw new SystemdError(
        `Failed to stop service: ${serviceName}`,
        serviceName,
        error
      )
    }
  }

  /**
   * Start a systemd user service without stopping first.
   *
   * @param serviceName - Name of the service to start
   * @throws SystemdError if start fails
   */
  async startService(serviceName: string): Promise<void> {
    try {
      await execQuiet(`systemctl ${this.userFlag} start ${serviceName}`)
    } catch (error: unknown) {
      throw new SystemdError(
        `Failed to start service: ${serviceName}`,
        serviceName,
        error
      )
    }
  }

  /**
   * Enable a systemd user service to start on login.
   *
   * @param serviceName - Name of the service to enable
   * @throws SystemdError if enable fails
   */
  async enableService(serviceName: string): Promise<void> {
    try {
      await execQuiet(`systemctl ${this.userFlag} enable ${serviceName}`)
    } catch (error: unknown) {
      throw new SystemdError(
        `Failed to enable service: ${serviceName}`,
        serviceName,
        error
      )
    }
  }

  /**
   * Disable a systemd user service from starting on login.
   *
   * @param serviceName - Name of the service to disable
   * @throws SystemdError if disable fails
   */
  async disableService(serviceName: string): Promise<void> {
    try {
      await execQuiet(`systemctl ${this.userFlag} disable ${serviceName}`)
    } catch (error: unknown) {
      throw new SystemdError(
        `Failed to disable service: ${serviceName}`,
        serviceName,
        error
      )
    }
  }

  /**
   * Utility method to create a delay.
   *
   * @param ms - Delay in milliseconds
   * @returns Promise that resolves after the delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

/**
 * Create a new SystemdManager instance.
 *
 * Convenience factory function.
 *
 * @returns New SystemdManager instance
 */
export function createSystemdManager(): SystemdManager {
  return new SystemdManager()
}
