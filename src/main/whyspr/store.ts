/**
 * Persistent storage for the license/auth subsystem.
 *
 * Token is encrypted with electron safeStorage (OS keychain when available).
 * Everything else lives in plain electron-store next to settings.
 */
import Store from 'electron-store'
import { safeStorage, app } from 'electron'
import type { AppState, AuthSession } from '../../shared/license'

type Persisted = {
  userId: string | null
  email: string | null
  name: string | null
  role: 'user' | 'admin' | null
  issuedAt: number | null
  /** base64 of the safeStorage-encrypted JWT. */
  encryptedAccessToken: string | null
  deviceHash: string | null
  /** Last-known state, used as a fallback when offline. */
  lastState: AppState | null
  lastStateAt: number | null
}

const DEFAULTS: Persisted = {
  userId: null,
  email: null,
  name: null,
  role: null,
  issuedAt: null,
  encryptedAccessToken: null,
  deviceHash: null,
  lastState: null,
  lastStateAt: null
}

let store: Store<Persisted> | null = null
function s(): Store<Persisted> {
  if (!store) {
    store = new Store<Persisted>({
      name: 'whyspr-auth',
      defaults: DEFAULTS,
      // Token is encrypted separately via safeStorage; this layer just
      // keeps the disk file from being trivially human-readable.
      encryptionKey: 'whyspr-auth-v1'
    })
  }
  return store
}

function encrypt(plaintext: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    // On Linux without keychain integration this can fail. Fall back to
    // raw — still inside the electron-store encryption envelope above.
    return Buffer.from(plaintext, 'utf8').toString('base64')
  }
  return safeStorage.encryptString(plaintext).toString('base64')
}

function decrypt(encoded: string): string {
  try {
    const buf = Buffer.from(encoded, 'base64')
    if (!safeStorage.isEncryptionAvailable()) {
      return buf.toString('utf8')
    }
    return safeStorage.decryptString(buf)
  } catch {
    return ''
  }
}

export function saveSession(session: AuthSession): void {
  s().set({
    userId: session.userId,
    email: session.email,
    name: session.name,
    role: session.role,
    issuedAt: session.issuedAt,
    encryptedAccessToken: encrypt(session.accessToken)
  })
}

export function loadSession(): AuthSession | null {
  const data = s().store
  if (!data.userId || !data.email || !data.encryptedAccessToken) return null
  const token = decrypt(data.encryptedAccessToken)
  if (!token) return null
  return {
    userId: data.userId,
    email: data.email,
    name: data.name,
    role: data.role ?? 'user',
    accessToken: token,
    issuedAt: data.issuedAt ?? Date.now()
  }
}

export function clearSession(): void {
  s().set({
    userId: null,
    email: null,
    name: null,
    role: null,
    issuedAt: null,
    encryptedAccessToken: null,
    lastState: null,
    lastStateAt: null
  })
}

export function getDeviceHash(): string | null {
  return s().get('deviceHash')
}

export function setDeviceHash(hash: string): void {
  s().set('deviceHash', hash)
}

export function cacheState(state: AppState): void {
  s().set({ lastState: state, lastStateAt: Date.now() })
}

export function loadCachedState(): { state: AppState | null; fetchedAt: number | null } {
  return {
    state: s().get('lastState'),
    fetchedAt: s().get('lastStateAt')
  }
}

/** Used by tests / "sign out everywhere" flows. */
export function wipeAll(): void {
  clearSession()
  s().set('deviceHash', null)
  // Force re-init next time
  store = null
  // electron-store doesn't expose deleteAll(); leaving DEFAULTS in place is fine.
  void app
}
