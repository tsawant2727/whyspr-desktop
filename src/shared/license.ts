/**
 * Mirrors the server-side AppState in whyspr-web/lib/license-state.ts.
 * Keep both in sync.
 */
export type LicenseState =
  | 'active'
  | 'trial'
  | 'expired'
  | 'cancelled'
  | 'paused'
  | 'no_license'
  | 'suspended'
  // Client-synthesized: server returned 403 seats_full when this device
  // tried to register. Means the user is signed in elsewhere. Not produced
  // by the server's getAppState — only by the desktop poller.
  | 'device_conflict'

export type LatestAppVersion = {
  version: string
  isRequired: boolean
  downloadUrl: string
  fileSize: number
  sha256: string
  releasedAt: string
  releaseNotes: string | null
} | null

export type ActiveDeviceSummary = {
  id: string
  deviceName: string
  platform: string
  lastActiveAt: string
}

export type AppState = {
  state: LicenseState
  allowsAppAccess: boolean
  plan: string | null
  seatsTotal: number
  seatsUsed: number
  expiresAt: string | null
  daysRemaining: number | null
  latestVersion: LatestAppVersion
  requiresUpdate: boolean
  message: string
  /** Populated only when state === 'device_conflict'. */
  activeDevices?: ActiveDeviceSummary[]
}

/** Local-only metadata about the signed-in user (kept in main-process store). */
export type AuthSession = {
  userId: string
  email: string
  name: string | null
  role: 'user' | 'admin'
  /** Encrypted on disk via electron safeStorage. */
  accessToken: string
  /** ms epoch — used to refresh before the JWT expires. */
  issuedAt: number
}

/** Composite snapshot the renderer subscribes to. */
export type AuthAndState = {
  user: Pick<AuthSession, 'email' | 'name' | 'role'> | null
  state: AppState | null
  /** Last successful refresh. null = never. */
  fetchedAt: number | null
  /** Last error message from the API, cleared on next success. */
  lastError: string | null
}

export const EMPTY_AUTH_AND_STATE: AuthAndState = {
  user: null,
  state: null,
  fetchedAt: null,
  lastError: null
}
