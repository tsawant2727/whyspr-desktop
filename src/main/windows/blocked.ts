import { BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { BRAND } from '../../shared/branding'

let blockedWin: BrowserWindow | null = null

export function openBlockedWindow(): BrowserWindow {
  if (blockedWin && !blockedWin.isDestroyed()) {
    blockedWin.focus()
    return blockedWin
  }

  blockedWin = new BrowserWindow({
    width: 520,
    height: 540,
    title: `${BRAND.productName} — Action required`,
    show: false,
    resizable: false,
    minimizable: true,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    backgroundColor: '#0b0f17',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  blockedWin.setContentProtection(true)

  blockedWin.on('ready-to-show', () => blockedWin?.show())
  blockedWin.on('closed', () => {
    blockedWin = null
  })

  blockedWin.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    blockedWin.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/blocked.html`)
  } else {
    blockedWin.loadFile(join(__dirname, '../renderer/blocked.html'))
  }

  return blockedWin
}

export function closeBlockedWindow(): void {
  if (blockedWin && !blockedWin.isDestroyed()) {
    blockedWin.close()
  }
  blockedWin = null
}

export function isBlockedWindowOpen(): boolean {
  return !!(blockedWin && !blockedWin.isDestroyed())
}
