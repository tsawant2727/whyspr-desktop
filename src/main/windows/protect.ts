import { BrowserWindow } from 'electron'

/**
 * Defensive content-protection lock.
 *
 * `setContentProtection(true)` sets `NSWindowSharingNone` on macOS /
 * `WDA_EXCLUDEFROMCAPTURE` on Windows so the window doesn't appear in
 * Zoom share, screen recordings, Meet share, etc.
 *
 * On macOS Sequoia 15.x + Electron 32+, transparent BrowserWindows
 * intermittently lose this flag after `show()`, `focus`, navigation, or
 * workspace changes — the window leaks into ScreenCaptureKit captures
 * (Chrome / Meet / QuickTime) even though we called setContentProtection
 * once at startup. Re-applying on every relevant lifecycle event is the
 * defensive workaround until the upstream regression is fixed.
 *
 * See: electron/electron#46538 and related macOS Sequoia reports.
 */
export function lockContentProtection(win: BrowserWindow): void {
  const apply = (): void => {
    if (win.isDestroyed()) return
    win.setContentProtection(true)
  }

  apply()
  win.on('show', apply)
  win.on('focus', apply)
  win.on('blur', apply)
  win.on('restore', apply)
  win.on('ready-to-show', apply)
  win.webContents.on('did-finish-load', apply)
  win.webContents.on('did-navigate', apply)
  win.webContents.on('dom-ready', apply)
}
