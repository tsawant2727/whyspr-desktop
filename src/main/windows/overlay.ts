import { BrowserWindow, screen, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { BRAND } from '../../shared/branding'

export function createOverlayWindow(): BrowserWindow {
  const display = screen.getPrimaryDisplay()
  const { width, height } = display.workArea

  const winWidth = 480
  const winHeight = 680

  const win = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x: width - winWidth - 24,
    y: 80,
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    show: false,
    backgroundColor: '#00000000',
    title: BRAND.overlayWindowTitle,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.setAlwaysOnTop(true, 'floating')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  // Hide overlay from screen sharing / recording / screenshots.
  // macOS: NSWindowSharingNone (invisible to Zoom share, QuickTime, etc.)
  // Windows: WDA_EXCLUDEFROMCAPTURE (Windows 10 2004+)
  win.setContentProtection(true)

  win.on('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/overlay.html`)
  } else {
    win.loadFile(join(__dirname, '../renderer/overlay.html'))
  }

  return win
}
