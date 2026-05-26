import { BrowserWindow } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { BRAND } from '../../shared/branding'

let settingsWin: BrowserWindow | null = null

export function openSettingsWindow(): BrowserWindow {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.focus()
    return settingsWin
  }

  settingsWin = new BrowserWindow({
    width: 800,
    height: 720,
    title: BRAND.settingsWindowTitle,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Hide settings window too — API keys and prompt content should never leak via screen share.
  settingsWin.setContentProtection(true)

  settingsWin.on('ready-to-show', () => settingsWin?.show())
  settingsWin.on('closed', () => {
    settingsWin = null
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    settingsWin.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/settings.html`)
  } else {
    settingsWin.loadFile(join(__dirname, '../renderer/settings.html'))
  }

  return settingsWin
}
