import { BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { BRAND } from '../../shared/branding'

let loginWin: BrowserWindow | null = null

export function openLoginWindow(): BrowserWindow {
  if (loginWin && !loginWin.isDestroyed()) {
    loginWin.focus()
    return loginWin
  }

  loginWin = new BrowserWindow({
    width: 440,
    height: 580,
    title: BRAND.loginWindowTitle,
    show: false,
    resizable: false,
    minimizable: false,
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

  loginWin.setContentProtection(true)

  loginWin.on('ready-to-show', () => loginWin?.show())
  loginWin.on('closed', () => {
    loginWin = null
  })

  loginWin.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    loginWin.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/login.html`)
  } else {
    loginWin.loadFile(join(__dirname, '../renderer/login.html'))
  }

  return loginWin
}

export function closeLoginWindow(): void {
  if (loginWin && !loginWin.isDestroyed()) {
    loginWin.close()
  }
  loginWin = null
}
