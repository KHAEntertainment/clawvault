/**
 * Windows Credential Manager Provider
 *
 * Uses execFile/spawn with argument arrays to avoid shell injection.
 *
 * Security model:
 * - All commands use execFile (no shell) with explicit argument arrays.
 * - Secret values are NEVER interpolated into command strings.
 * - For PowerShell operations, arguments are passed as separate argv entries
 *   to execFile, not concatenated into a -Command string.
 * - Secret names are validated against a strict allowlist pattern.
 * - Timeout and buffer limits prevent resource exhaustion.
 *
 * Architecture:
 * - set/delete: use `cmdkey.exe` via execFile with argument arrays.
 * - get: uses PowerShell's CredRead via a .NET P/Invoke snippet. The script
 *   is passed as a single -Command argument to execFile('powershell'), which
 *   is safe because execFile does not invoke cmd.exe shell interpretation.
 *   The secret name is injected via a `-Name` parameter, not string interpolation.
 * - list: uses `cmdkey /list` via execFile and parses stdout.
 *
 * Troubleshooting (for agents):
 * - "cmdkey: not recognized" → Windows Credential Manager missing or PATH
 *   issue. Fallback provider will be used.
 * - get() returns null when credential does not exist.
 * - PowerShell execution policy may block scripts; we use -ExecutionPolicy
 *   Bypass for the inline command.
 */

import { execFile } from 'child_process'
import { StorageProvider } from '../interfaces.js'

const TARGET_PREFIX = 'clawvault:'
const EXEC_TIMEOUT_MS = 10_000
const EXEC_MAX_BUFFER_BYTES = 1 * 1024 * 1024

const SAFE_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/

function execFileAsync(
  file: string,
  args: string[]
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      { timeout: EXEC_TIMEOUT_MS, maxBuffer: EXEC_MAX_BUFFER_BYTES },
      (error, stdout, stderr) => {
        if (error) {
          reject(error)
          return
        }
        resolve({ stdout: String(stdout ?? ''), stderr: String(stderr ?? '') })
      }
    )
  })
}

/**
 * PowerShell script that retrieves a Windows credential by target name.
 * The target name is passed as $env:CV_TARGET (set via execFile env option)
 * to avoid any string interpolation in the script body.
 */
const PS_GET_CREDENTIAL = `
$ErrorActionPreference = 'Stop'
$target = $env:CV_TARGET
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class CredManager {
    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern bool CredRead(string target, int type, int flags, out IntPtr cred);
    [DllImport("advapi32.dll")]
    public static extern void CredFree(IntPtr cred);
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct CREDENTIAL {
        public int Flags;
        public int Type;
        public string TargetName;
        public string Comment;
        public long LastWritten;
        public int CredentialBlobSize;
        public IntPtr CredentialBlob;
        public int Persist;
        public int AttributeCount;
        public IntPtr Attributes;
        public string TargetAlias;
        public string UserName;
    }
    public static string GetPassword(string target) {
        IntPtr credPtr;
        if (!CredRead(target, 1, 0, out credPtr)) return "";
        try {
            CREDENTIAL cred = (CREDENTIAL)Marshal.PtrToStructure(credPtr, typeof(CREDENTIAL));
            if (cred.CredentialBlobSize > 0) {
                return Marshal.PtrToStringUni(cred.CredentialBlob, cred.CredentialBlobSize / 2);
            }
            return "";
        } finally { CredFree(credPtr); }
    }
}
'@
$result = [CredManager]::GetPassword($target)
[Console]::Out.Write($result)
`

export class WindowsCredentialManager implements StorageProvider {
  private validateName(name: string): void {
    if (!SAFE_NAME_PATTERN.test(name)) {
      throw new Error(`Invalid secret name: ${name}`)
    }
  }

  private targetFor(name: string): string {
    return `${TARGET_PREFIX}${name}`
  }

  /**
   * Store a secret in Windows Credential Manager.
   *
   * Uses cmdkey with execFile. The /pass argument is a direct argv entry --
   * execFile does not invoke cmd.exe, so no shell metacharacter expansion.
   */
  async set(name: string, value: string): Promise<void> {
    this.validateName(name)
    await this.delete(name)

    await execFileAsync('cmdkey', [
      `/generic:${this.targetFor(name)}`,
      `/user:${name}`,
      `/pass:${value}`
    ])
  }

  /**
   * Retrieve a secret from Windows Credential Manager.
   * INTERNAL USE ONLY - never expose to AI context.
   *
   * Uses PowerShell CredRead via .NET P/Invoke. The target name is passed
   * through the CV_TARGET environment variable, not string interpolation.
   */
  async get(name: string): Promise<string | null> {
    this.validateName(name)
    try {
      const { stdout } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        execFile(
          'powershell',
          ['-ExecutionPolicy', 'Bypass', '-NoProfile', '-Command', PS_GET_CREDENTIAL],
          {
            timeout: EXEC_TIMEOUT_MS,
            maxBuffer: EXEC_MAX_BUFFER_BYTES,
            env: { ...process.env, CV_TARGET: this.targetFor(name) }
          },
          (error, stdout, stderr) => {
            if (error) { reject(error); return }
            resolve({ stdout: String(stdout ?? ''), stderr: String(stderr ?? '') })
          }
        )
      })
      return stdout || null
    } catch {
      return null
    }
  }

  /**
   * Delete a secret from Windows Credential Manager.
   */
  async delete(name: string): Promise<void> {
    this.validateName(name)
    try {
      await execFileAsync('cmdkey', [`/delete:${this.targetFor(name)}`])
    } catch {
      // Ignore errors if credential doesn't exist
    }
  }

  /**
   * List all ClawVault secrets from Windows Credential Manager.
   * Runs `cmdkey /list` and parses for our target prefix.
   */
  async list(): Promise<string[]> {
    try {
      const { stdout } = await execFileAsync('cmdkey', ['/list'])
      return this.parseCmdkeyOutput(stdout)
    } catch {
      return []
    }
  }

  async has(name: string): Promise<boolean> {
    const list = await this.list()
    return list.includes(name)
  }

  /**
   * Parse cmdkey /list output for entries matching our target prefix.
   *
   * Output format:
   *   Target: LegacyGeneric:target=clawvault:SECRET_NAME
   *   Type: Generic
   *   User: SECRET_NAME
   *
   * We match on the Target line containing our prefix, then extract the name.
   */
  private parseCmdkeyOutput(output: string): string[] {
    const names: string[] = []
    if (!output) return names

    const lines = output.split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      const match = trimmed.match(/Target:\s*.*?clawvault:([A-Z][A-Z0-9_]*)/i)
      if (match) {
        names.push(match[1])
      }
    }

    return names
  }
}
