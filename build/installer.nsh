; Custom NSIS hooks for the Whispy Windows installer + uninstaller.
;
; Why this file exists:
;   electron-builder's default _CHECK_APP_RUNNING tries to taskkill the app
;   but only once, with a single retry, and only for processes owned by the
;   current user. On real machines we've seen it fail to close Electron
;   helper processes in time, after which the installer falls back to a
;   "Whispy can't be closed, please close it manually" dialog with no
;   obvious way out.
;
; What this does:
;   Overriding `customCheckAppRunning` REPLACES electron-builder's default
;   check entirely (see allowOnlyOneInstallerInstance.nsh: CHECK_APP_RUNNING
;   dispatches to customCheckAppRunning when defined). The replacement runs
;   in both the installer (when upgrading over an existing install) AND
;   the uninstaller (when the user picks "Uninstall Whispy" from the
;   Start Menu / Apps & features).
;
;   We do three passes with increasing aggression, then wait for file
;   handles to release. No user prompt — by the time we're here the user
;   already accepted the install/uninstall, asking again helps nobody.

!macro customCheckAppRunning
  DetailPrint "Closing any running Whispy instance..."

  ; Pass 1: graceful taskkill (no /F). Gives Electron a chance to flush
  ; renderer state before being forced down.
  nsExec::Exec '"$SYSDIR\cmd.exe" /c taskkill /T /IM "${APP_EXECUTABLE_FILENAME}"'
  Sleep 1200

  ; Pass 2: force kill, including the whole process tree (main + GPU /
  ; renderer / utility helpers).
  nsExec::Exec '"$SYSDIR\cmd.exe" /c taskkill /F /T /IM "${APP_EXECUTABLE_FILENAME}"'
  Sleep 1200

  ; Pass 3: belt-and-braces. If any helper respawned in the ~2 seconds
  ; since pass 2, kill it again.
  nsExec::Exec '"$SYSDIR\cmd.exe" /c taskkill /F /T /IM "${APP_EXECUTABLE_FILENAME}"'
  Sleep 1500
!macroend
