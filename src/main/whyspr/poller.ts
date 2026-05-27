/**
 * License/state poller.
 *
 * Lifecycle:
 *   start()      — call once on app.whenReady AFTER user is logged in.
 *                  Registers the device, fetches state, schedules next tick.
 *   refreshNow() — manual trigger (used by login + meeting-start in future).
 *   stop()       — cancels timer (used on logout).
 *
 * Every state change is broadcast on IPC channel 'license:state' to all
 * BrowserWindows. The renderer subscribes via window.api.on.licenseState().
 *
 * Heartbeat cadence: 2 hours background + immediate-on-launch (handled by
 * caller invoking start() at app ready).
 */
import { BrowserWindow } from 'electron'
import { api } from './api'
import { logout, currentSession } from './auth'
import { getDeviceMetadata } from './device'
import { cacheState, loadCachedState } from './store'
import { HEARTBEAT_INTERVAL_MS } from './config'
import type { AppState, AuthAndState, ActiveDeviceSummary } from '../../shared/license'
import { EMPTY_AUTH_AND_STATE } from '../../shared/license'

type PollOutcome =
  | { kind: 'state'; state: AppState }
  | { kind: 'token_invalid'; message: string }
  | { kind: 'suspended'; message: string }
  | { kind: 'network_error'; message: string }
  | { kind: 'logged_out' }

type RegisterResult =
  | { ok: true }
  | {
      ok: false
      code: 'seats_full' | 'license_expired' | 'no_license' | 'other'
      status: number
      message: string
      activeDevices?: ActiveDeviceSummary[]
    }

function syntheticState(
  base: Partial<AppState>,
  state: AppState['state'],
  message: string,
  activeDevices?: ActiveDeviceSummary[]
): AppState {
  return {
    state,
    allowsAppAccess: false,
    plan: base.plan ?? null,
    seatsTotal: base.seatsTotal ?? 1,
    seatsUsed: base.seatsUsed ?? 0,
    expiresAt: base.expiresAt ?? null,
    daysRemaining: base.daysRemaining ?? null,
    latestVersion: base.latestVersion ?? null,
    requiresUpdate: false,
    message,
    activeDevices
  }
}

let timer: NodeJS.Timeout | null = null
let lastSnapshot: AuthAndState = EMPTY_AUTH_AND_STATE
let inflight = false
const mainListeners = new Set<(snap: AuthAndState) => void>()

export function getSnapshot(): AuthAndState {
  return lastSnapshot
}

/**
 * Subscribe in the main process (e.g. for window routing). Returns
 * unsubscribe. Renderer side uses the IPC 'license:state' channel.
 */
export function onState(cb: (snap: AuthAndState) => void): () => void {
  mainListeners.add(cb)
  return () => mainListeners.delete(cb)
}

function broadcast(snap: AuthAndState): void {
  lastSnapshot = snap
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('license:state', snap)
  }
  for (const cb of mainListeners) {
    try {
      cb(snap)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[whyspr] mainListener threw', err)
    }
  }
}

async function registerDeviceOnce(): Promise<RegisterResult> {
  const meta = getDeviceMetadata()
  const r = await api<unknown>('/api/devices/register', {
    method: 'POST',
    body: {
      deviceHash: meta.deviceHash,
      deviceName: meta.deviceName,
      platform: meta.platform,
      osVersion: meta.osVersion,
      appVersion: meta.appVersion
    }
  })
  if (r.ok) return { ok: true }

  const body = (r.body ?? {}) as Record<string, unknown>
  if (r.code === 'seats_full') {
    return {
      ok: false,
      code: 'seats_full',
      status: r.status,
      message: r.message,
      activeDevices: Array.isArray(body.activeDevices)
        ? (body.activeDevices as ActiveDeviceSummary[])
        : []
    }
  }
  if (r.code === 'license_expired' || r.code === 'no_license') {
    return { ok: false, code: r.code, status: r.status, message: r.message }
  }
  return { ok: false, code: 'other', status: r.status, message: r.message }
}

async function fetchState(): Promise<PollOutcome> {
  const meta = getDeviceMetadata()
  const r = await api<AppState | { ok: true } & AppState>(
    '/api/devices/heartbeat',
    {
      method: 'POST',
      body: {
        deviceHash: meta.deviceHash,
        appVersion: meta.appVersion,
        platform: meta.platform
      },
      timeoutMs: 10_000
    }
  )

  if (r.ok) {
    // eslint-disable-next-line no-console
    console.log('[whyspr] heartbeat ok', {
      state: (r.body as AppState)?.state,
      allowsAppAccess: (r.body as AppState)?.allowsAppAccess,
      daysRemaining: (r.body as AppState)?.daysRemaining
    })
    return { kind: 'state', state: r.body as AppState }
  }
  // eslint-disable-next-line no-console
  console.warn('[whyspr] heartbeat failed', { status: r.status, code: r.code, message: r.message })

  // Auth-class errors mean the local token is no longer valid for this user.
  if (r.code === 'account_suspended') {
    return { kind: 'suspended', message: r.message }
  }
  if (
    r.code === 'missing_token' ||
    r.code === 'invalid_token' ||
    r.code === 'user_not_found' ||
    r.status === 401
  ) {
    return { kind: 'token_invalid', message: r.message }
  }
  // Device record was wiped by an admin OR this is the first call after a
  // fresh login. Try register, then heartbeat again. If register itself
  // tells us the seat is taken or the license is gone, synthesize a
  // blocking state so the UI can show the right screen.
  if (r.code === 'device_not_registered') {
    const reg = await registerDeviceOnce()
    if (!reg.ok) {
      if (reg.code === 'seats_full') {
        return {
          kind: 'state',
          state: syntheticState({}, 'device_conflict', reg.message, reg.activeDevices)
        }
      }
      if (reg.code === 'license_expired') {
        return { kind: 'state', state: syntheticState({}, 'expired', reg.message) }
      }
      if (reg.code === 'no_license') {
        return { kind: 'state', state: syntheticState({}, 'no_license', reg.message) }
      }
      // 'other' — fall through to generic network_error below
    } else {
      const retry = await api<AppState>('/api/devices/heartbeat', {
        method: 'POST',
        body: {
          deviceHash: meta.deviceHash,
          appVersion: meta.appVersion,
          platform: meta.platform
        },
        timeoutMs: 10_000
      })
      if (retry.ok) return { kind: 'state', state: retry.body as AppState }
    }
  }
  return { kind: 'network_error', message: r.message }
}

export async function refreshNow(): Promise<PollOutcome> {
  const sess = currentSession()
  if (!sess) {
    broadcast(EMPTY_AUTH_AND_STATE)
    return { kind: 'logged_out' }
  }
  if (inflight) {
    return lastSnapshot.state
      ? { kind: 'state', state: lastSnapshot.state }
      : { kind: 'network_error', message: 'refresh already in flight' }
  }
  inflight = true
  try {
    const outcome = await fetchState()
    if (outcome.kind === 'state') {
      cacheState(outcome.state)
      broadcast({
        user: { email: sess.email, name: sess.name, role: sess.role },
        state: outcome.state,
        fetchedAt: Date.now(),
        lastError: null
      })
    } else if (outcome.kind === 'suspended' || outcome.kind === 'token_invalid') {
      // Server says this token is no longer valid for this account — drop it.
      logout()
      broadcast({
        user: null,
        state: null,
        fetchedAt: Date.now(),
        lastError: outcome.message
      })
    } else if (outcome.kind === 'network_error') {
      // Keep the previous user/state but surface the error so UI can show offline.
      const cached = loadCachedState()
      broadcast({
        user: { email: sess.email, name: sess.name, role: sess.role },
        state: cached.state ?? lastSnapshot.state,
        fetchedAt: cached.fetchedAt ?? lastSnapshot.fetchedAt,
        lastError: outcome.message
      })
    }
    return outcome
  } finally {
    inflight = false
  }
}

export async function start(): Promise<void> {
  stop()
  // Always register on start — covers first-ever launch AND post-login.
  // If register fails up-front (seat taken / license gone) we synthesize
  // the right blocked state immediately so the user isn't stuck waiting
  // for the heartbeat to retry.
  const reg = await registerDeviceOnce()
  if (!reg.ok) {
    const sess = currentSession()
    let synth: AppState | null = null
    if (reg.code === 'seats_full') {
      synth = syntheticState({}, 'device_conflict', reg.message, reg.activeDevices)
    } else if (reg.code === 'license_expired') {
      synth = syntheticState({}, 'expired', reg.message)
    } else if (reg.code === 'no_license') {
      synth = syntheticState({}, 'no_license', reg.message)
    }
    if (synth && sess) {
      cacheState(synth)
      broadcast({
        user: { email: sess.email, name: sess.name, role: sess.role },
        state: synth,
        fetchedAt: Date.now(),
        lastError: null
      })
      // Still set up the timer — user might revoke the other device or
      // renew, and the next heartbeat will pick up the change.
      timer = setInterval(() => {
        void refreshNow()
      }, HEARTBEAT_INTERVAL_MS)
      return
    }
  }
  await refreshNow()
  timer = setInterval(() => {
    void refreshNow()
  }, HEARTBEAT_INTERVAL_MS)
}

export function stop(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

/** Used after logout to push an empty state to all windows. */
export function clearSnapshot(): void {
  broadcast(EMPTY_AUTH_AND_STATE)
}
