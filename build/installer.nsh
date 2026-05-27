; Custom NSIS hooks for the Whispy Windows installer.
;
; Why this file exists:
;   electron-builder's NSIS template detects when the target app is already
;   running and asks the user to close it manually before continuing. When
;   the running process is the system-tray copy of an older version that's
;   minimised out of sight, users hit "Whispy can't be closed, please close
;   it manually" with no obvious way to fix it.
;
; What this fixes:
;   customInit runs at the very start of the installer, before NSIS's own
;   "is the app running?" check. We force-kill the whole Whispy process
;   tree (main + GPU/renderer/utility helpers) so the subsequent file copy
;   has no lock to contend with.

!macro customInit
  ; /F = force, /T = also kill child processes (Electron helper procs)
  nsExec::Exec 'taskkill /F /T /IM "Whispy.exe"'
  ; Give Windows a moment to release file handles before the install section
  ; starts overwriting files in Program Files / AppData.
  Sleep 500
!macroend
