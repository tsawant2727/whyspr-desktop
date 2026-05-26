import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  Tray,
  nativeImage,
  session as electronSession,
  desktopCapturer,
  dialog
} from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { createOverlayWindow } from './windows/overlay'
import { openSettingsWindow } from './windows/settings'
import { getSettings, updateSettings, applyTemplate } from './store/settings'
import { SessionManager } from './session'
import {
  openRecordingsFolder,
  openFile,
  getRecordingsDir
} from './storage/recordings'
import { BRAND } from '../shared/branding'

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

  ipcMain.handle('session:start', () => session.start())
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
  // We auto-pick the primary screen and force system audio loopback so the user
  // never has to interact with a picker. Works on macOS 13+ and Windows.
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

app.whenReady().then(() => {
  electronApp.setAppUserModelId(BRAND.appUserModelId)

  app.on('browser-window-created', (_, win) => {
    optimizer.watchWindowShortcuts(win)
  })

  registerDisplayMediaHandler()
  registerIpc()
  buildTray()
  overlay = createOverlayWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      overlay = createOverlayWindow()
    }
  })
})

app.on('window-all-closed', (e: Electron.Event) => {
  // Keep app alive in tray
  e.preventDefault()
})

app.on('before-quit', () => {
  session.stop()
})
