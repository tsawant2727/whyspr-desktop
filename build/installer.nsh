; Custom NSIS hooks for the Whispy Windows installer + uninstaller.
;
; Goal: the new installer must succeed unconditionally. Past attempts
; failed in two ways:
;
;   1. The taskkill only targeted "Whispy.exe" — users still on the
;      pre-rename build (which shipped as "Whyspr.exe") were untouched
;      so the file lock survived.
;
;   2. electron-builder's `uninstallOldVersion` step silently invokes
;      the OLD uninstaller binary, which has its OWN running-app check
;      built from the unfixed template. Even with the new installer's
;      check passing cleanly, the old uninstaller could still get in
;      the way.
;
; Strategy:
;   - Define a single KillAllWhispy macro that taskkills BOTH executable
;     names via two independent methods (taskkill + PowerShell). Call it
;     from customInit, customCheckAppRunning AND customUnInstall so every
;     entry point cleans up.
;   - In customInit, wipe the old uninstall-registry key so the new
;     installer's `uninstallOldVersion` step finds nothing to run. This
;     skips the broken old uninstaller entirely; orphan files in the old
;     install dir (if any) get overwritten when the new install lands in
;     the same directory.

!macro KillAllWhispy
  ; taskkill for the current executable name.
  nsExec::Exec '"$SYSDIR\cmd.exe" /c taskkill /F /T /IM "Whispy.exe"'
  ; taskkill for the legacy pre-rename executable name.
  nsExec::Exec '"$SYSDIR\cmd.exe" /c taskkill /F /T /IM "Whyspr.exe"'
  ; PowerShell as a second method — Stop-Process -Force handles edge
  ; cases where taskkill silently fails (process owned by another
  ; security context, helper respawning, etc).
  nsExec::Exec '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "Get-Process Whispy,Whyspr -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue"'
!macroend

!macro customInit
  ; Pass 1: early kill, before electron-builder's own checks fire.
  !insertmacro KillAllWhispy
  Sleep 1500
  !insertmacro KillAllWhispy
  Sleep 500

  ; Wipe the previous version's uninstall registry entries so the new
  ; installer's `uninstallOldVersion` step finds nothing to invoke and
  ; we never trigger the broken old uninstaller. The new install will
  ; overwrite files in place.
  ;
  ; The key path uses ${UNINSTALL_APP_KEY} which electron-builder defines
  ; from the appId (com.whyspr.app). Both HKCU (per-user) and HKLM (per-
  ; machine) variants are wiped because we don't know which mode the
  ; legacy install used.
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}"
!macroend

!macro customCheckAppRunning
  ; REPLACES electron-builder's default running-app check (see
  ; allowOnlyOneInstallerInstance.nsh: CHECK_APP_RUNNING dispatches to
  ; this macro when defined). Runs in BOTH installer and uninstaller.
  ; No user prompt — by now the user already accepted the install.

  DetailPrint "Closing any running Whispy / Whyspr instances..."

  ; Three passes, ~1.5s sleep between each, to handle helper-process
  ; respawn and slow file-handle release.
  !insertmacro KillAllWhispy
  Sleep 1500
  !insertmacro KillAllWhispy
  Sleep 1500
  !insertmacro KillAllWhispy
  Sleep 1500
!macroend
