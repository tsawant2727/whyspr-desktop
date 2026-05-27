import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  Tray,
  nativeImage,
  session as electronSession,
  desktopCapturer,
  dialog,
  globalShortcut
} from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { createOverlayWindow } from './windows/overlay'
import { openSettingsWindow } from './windows/settings'
import { openLoginWindow, closeLoginWindow } from './windows/login'
import { openBlockedWindow, closeBlockedWindow } from './windows/blocked'
import { getSettings, updateSettings, applyTemplate } from './store/settings'
import { SessionManager } from './session'
import {
  openRecordingsFolder,
  openFile,
  getRecordingsDir
} from './storage/recordings'
import { BRAND } from '../shared/branding'
import { initWhyspr } from './whyspr'
import { currentSession, logout as whysprLogout } from './whyspr/auth'
import { getSnapshot, onState, stop as stopPoller, clearSnapshot } from './whyspr/poller'
import type { AppState } from '../shared/license'

let overlay: BrowserWindow | null = null
let tray: Tray | null = null
const session = new SessionManager(() => overlay)

function buildTray(): void {
  const icon = nativeImage.createEmpty()
  tray = new Tray(icon)
  tray.setToolTip(BRAND.trayTooltip)
  const menu = Menu.buildFromTemplate([
    {
      label: 'Show Overlay',
      click: () => {
        if (!currentSession()) {
          openLoginWindow()
          return
        }
        if (!overlay || overlay.isDestroyed()) {
          overlay = createOverlayWindow()
        } else {
          overlay.show()
          overlay.focus()
        }
      }
    },
    { label: 'Settings…', click: () => openSettingsWindow() },
    { type: 'separator' },
    {
      label: 'Stop Session',
      click: () => session.stop()
    },
    { type: 'separator' },
    { label: 'Sign out', click: () => signOut() },
    { label: 'Quit', click: () => app.quit() }
  ])
  tray.setContextMenu(menu)
}

function broadcastSettings(settings: ReturnType<typeof getSettings>): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('settings:updated', settings)
  }
}

function registerIpc(): void {
  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:set', (_e, patch) => {
    const next = updateSettings(patch)
    broadcastSettings(next)
    return next
  })
  ipcMain.handle('settings:apply-template', (_e, templateId: string) => {
    const next = applyTemplate(templateId)
    broadcastSettings(next)
    return next
  })
  ipcMain.handle('settings:open', () => {
    openSettingsWindow()
  })

  ipcMain.handle('session:start', () => {
    // Gate session start on license — if user isn't allowed, route them to
    // the blocked screen instead of silently letting the meeting begin.
    const snap = getSnapshot()
    if (snap.state && !snap.state.allowsAppAccess) {
      openBlockedWindow()
      return { ok: false, error: snap.state.message }
    }
    return session.start()
  })
  ipcMain.handle('session:stop', () => {
    session.stop()
    return { ok: true }
  })
  ipcMain.handle('session:status', () => ({ active: session.isActive() }))
  ipcMain.handle('session:request-suggestion', () => {
    session.requestSuggestion()
    return { ok: true }
  })

  ipcMain.handle('window:hide-overlay', () => {
    if (overlay && !overlay.isDestroyed()) overlay.hide()
    return { ok: true }
  })
  ipcMain.handle('window:minimize-overlay', () => {
    if (overlay && !overlay.isDestroyed()) overlay.minimize()
    return { ok: true }
  })
  ipcMain.handle('window:resize-overlay', (_e, payload: { width: number }) => {
    if (!overlay || overlay.isDestroyed()) return { ok: false }
    const bounds = overlay.getBounds()
    const display = require('electron').screen.getDisplayMatching(bounds)
    const workArea = display.workArea
    const rightEdge = bounds.x + bounds.width
    const newX = Math.max(workArea.x, rightEdge - payload.width)
    overlay.setBounds({
      x: newX,
      y: bounds.y,
      width: payload.width,
      height: bounds.height
    })
    return { ok: true }
  })

  ipcMain.on('session:audio-chunk:system', (_e, chunk: ArrayBuffer) => {
    session.pushSystemAudio(Buffer.from(chunk))
  })
  ipcMain.on('session:audio-chunk:mic', (_e, chunk: ArrayBuffer) => {
    session.pushMicAudio(Buffer.from(chunk))
  })

  ipcMain.handle(
    'session:save-recording',
    async (_e, payload: { data: ArrayBuffer; mimeType: string }) => {
      const path = await session.saveRecordingBlob(
        Buffer.from(payload.data),
        payload.mimeType
      )
      return { ok: !!path, path }
    }
  )

  ipcMain.handle('session:finalize', async () => {
    return session.finalize()
  })

  ipcMain.handle('storage:open-recordings-folder', async () => {
    await openRecordingsFolder()
    return { ok: true }
  })
  ipcMain.handle('storage:open-file', async (_e, filePath: string) => {
    await openFile(filePath)
    return { ok: true }
  })
  ipcMain.handle('storage:get-recordings-dir', () => getRecordingsDir())

  ipcMain.handle('dialog:choose-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Choose folder to save recordings, transcripts, and summaries',
      buttonLabel: 'Select Folder'
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true }
    }
    return { canceled: false, path: result.filePaths[0] }
  })
}

function registerDisplayMediaHandler(): void {
  // Required for navigator.mediaDevices.getDisplayMedia() to work in Electron 26+.
  electronSession.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        fetchWindowIcons: false,
        thumbnailSize: { width: 0, height: 0 }
      })
      if (sources.length === 0) {
        console.error('[display-media] no screen sources available')
        callback({})
        return
      }
      callback({ video: sources[0], audio: 'loopback' })
    } catch (err) {
      console.error('[display-media] handler error', err)
      callback({})
    }
  })
}

// ─── Window routing based on auth + license state ────────────────────────────

function showOverlay(): void {
  if (!overlay || overlay.isDestroyed()) {
    overlay = createOverlayWindow()
  } else {
    overlay.show()
  }
}

function hideOverlay(): void {
  if (overlay && !overlay.isDestroyed()) overlay.hide()
}

function applyRouting(state: AppState | null): void {
  if (!currentSession()) {
    hideOverlay()
    closeBlockedWindow()
    openLoginWindow()
    return
  }

  closeLoginWindow()

  if (state && !state.allowsAppAccess) {
    hideOverlay()
    openBlockedWindow()
    return
  }
  if (state && state.requiresUpdate) {
    hideOverlay()
    openBlockedWindow()
    return
  }

  // Healthy state.
  closeBlockedWindow()
  showOverlay()
}

function signOut(): void {
  session.stop()
  stopPoller()
  whysprLogout()
  clearSnapshot()
  applyRouting(null)
}

/**
 * Global keyboard shortcut to manually trigger a new suggestion.
 *
 * Mac: ⌘+Shift+G  ·  Win/Linux: Ctrl+Shift+G
 *
 * Works from anywhere — Zoom, Meet, browser — so the user never has to
 * alt-tab to the overlay just to ask for a fresh reply.
 *
 * Behavior:
 *   - If no session is active, no-op (avoid surprise side-effects).
 *   - Otherwise calls SessionManager.requestSuggestion(), which is the same
 *     code path as the in-overlay "Regenerate" button.
 *
 * If registration fails (e.g. another app has the same combo), we log and
 * carry on — the in-overlay button still works.
 */
export const REGENERATE_SHORTCUT = 'CommandOrControl+Shift+G'

function registerGlobalShortcuts(): void {
  const ok = globalShortcut.register(REGENERATE_SHORTCUT, () => {
    if (!session.isActive()) return
    session.requestSuggestion()
  })
  if (!ok) {
    // eslint-disable-next-line no-console
    console.warn(
      `[whyspr] could not register global shortcut "${REGENERATE_SHORTCUT}" — ` +
        'another app may have it. The in-overlay Regenerate button still works.'
    )
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId(BRAND.appUserModelId)

  app.on('browser-window-created', (_, win) => {
    optimizer.watchWindowShortcuts(win)
  })

  registerDisplayMediaHandler()
  registerIpc()
  await initWhyspr()
  buildTray()
  registerGlobalShortcuts()

  // React to every state change in the main process for window routing.
  // (The renderer windows use the IPC 'license:state' channel separately.)
  onState((snap) => applyRouting(snap.state))
  // Initial routing pass — needed because by the time we get here the poller
  // may or may not have produced a snapshot yet.
  applyRouting(getSnapshot().state ?? null)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      applyRouting(getSnapshot().state ?? null)
    }
  })
})

app.on('window-all-closed', (e: Electron.Event) => {
  // Keep app alive in tray
  e.preventDefault()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('before-quit', () => {
  session.stop()
})
