/**
 * Whyspr license/auth subsystem entry point.
 *
 * Call init() once on app.whenReady. It will:
 *   1. Register IPC handlers (login/logout/refresh/snapshot)
 *   2. Wire device hash on first run
 *   3. Boot the poller if we already have a session
 *
 * Importing this file is the only thing main/index.ts needs to do.
 */
import { ipcMain } from 'electron'
import { login, logout, currentSession } from './auth'
import { start, stop, refreshNow, getSnapshot, clearSnapshot } from './poller'
import { getOrCreateDeviceHash } from './device'
import type { AuthAndState } from '../../shared/license'

export type WhysprIpc = {
  'whyspr:login': (email: string, password: string) => Promise<
    { ok: true } | { ok: false; message: string }
  >
  'whyspr:logout': () => Promise<{ ok: true }>
  'whyspr:refresh': () => Promise<AuthAndState>
  'whyspr:snapshot': () => Promise<AuthAndState>
  'whyspr:has-session': () => Promise<boolean>
}

export async function initWhyspr(): Promise<void> {
  // Make sure the device hash is generated synchronously on first run so
  // subsequent renderer queries don't race with the poller.
  getOrCreateDeviceHash()

  ipcMain.handle('whyspr:login', async (_e, email: string, password: string) => {
    const r = await login(email, password)
    if (!r.ok) {
      return { ok: false as const, message: r.message }
    }
    // Boot the poller now that we have a token.
    await start()
    return { ok: true as const }
  })

  ipcMain.handle('whyspr:logout', async () => {
    stop()
    logout()
    clearSnapshot()
    return { ok: true as const }
  })

  ipcMain.handle('whyspr:refresh', async () => {
    await refreshNow()
    return getSnapshot()
  })

  ipcMain.handle('whyspr:snapshot', () => getSnapshot())

  ipcMain.handle('whyspr:has-session', () => !!currentSession())

  // If we already have a saved session, boot the poller. If not, the login
  // window will trigger the poller after a successful sign-in.
  if (currentSession()) {
    await start()
  }
}
