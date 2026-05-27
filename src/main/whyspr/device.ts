/**
 * Stable hardware fingerprint for "1 user = 1 PC" seat enforcement.
 *
 * Inputs: OS machine-id (where available) + platform + hostname.
 * Output: SHA-256 hex truncated to 32 chars. Persisted so we send the same
 * value on every register / heartbeat call.
 */
import { createHash } from 'crypto'
import { execSync } from 'child_process'
import { hostname, platform } from 'os'
import { app } from 'electron'
import { getDeviceHash, setDeviceHash } from './store'

function machineId(): string {
  try {
    if (process.platform === 'darwin') {
      const out = execSync(
        "ioreg -rd1 -c IOPlatformExpertDevice | awk -F'\"' '/IOPlatformUUID/{print $4}'",
        { stdio: ['ignore', 'pipe', 'ignore'], timeout: 1500 }
      )
        .toString()
        .trim()
      if (out) return out
    } else if (process.platform === 'win32') {
      const out = execSync(
        'reg query HKLM\\SOFTWARE\\Microsoft\\Cryptography /v MachineGuid',
        { stdio: ['ignore', 'pipe', 'ignore'], timeout: 1500 }
      )
        .toString()
      const m = out.match(/MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]+)/)
      if (m) return m[1]
    } else if (process.platform === 'linux') {
      const out = execSync('cat /etc/machine-id || cat /var/lib/dbus/machine-id', {
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 1500
      })
        .toString()
        .trim()
      if (out) return out
    }
  } catch {
    // fall through to fallback
  }
  // Fallback: stable but per-install. Tied to userData path so reinstall = new id.
  return `fallback:${app.getPath('userData')}`
}

export function getOrCreateDeviceHash(): string {
  const cached = getDeviceHash()
  if (cached) return cached

  const raw = `${machineId()}|${platform()}|${hostname()}`
  const hash = createHash('sha256').update(raw).digest('hex').slice(0, 32)
  setDeviceHash(hash)
  return hash
}

export function getDeviceMetadata(): {
  deviceHash: string
  deviceName: string
  platform: 'mac' | 'win' | 'linux'
  osVersion: string
  appVersion: string
} {
  const platformKey: 'mac' | 'win' | 'linux' =
    process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : 'linux'
  return {
    deviceHash: getOrCreateDeviceHash(),
    deviceName: hostname(),
    platform: platformKey,
    osVersion: `${platform()} ${process.getSystemVersion?.() ?? ''}`.trim(),
    appVersion: app.getVersion()
  }
}
