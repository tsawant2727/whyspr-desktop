/**
 * Small dismissible "Update available" banner shown at the top of the overlay
 * when the server reports a newer app version. Required updates are NOT
 * handled here — those route to the full-screen blocked window. This banner
 * only fires for soft / optional updates.
 *
 * Dismiss persists per-version: dismissing v0.3.0 hides the banner until
 * the server publishes v0.4.0+.
 */
import { useEffect, useMemo, useState } from 'react'
import { BRAND } from '@shared/branding'
import type { AuthAndState } from '@shared/license'

/** Same loose semver compare used by the server's license-state helper. */
function compareSemver(a: string, b: string): number {
  const norm = (s: string): number[] =>
    s
      .split(/[-+]/)[0]
      .split('.')
      .map((p) => parseInt(p, 10) || 0)
  const aa = norm(a)
  const bb = norm(b)
  for (let i = 0; i < Math.max(aa.length, bb.length); i++) {
    const x = aa[i] ?? 0
    const y = bb[i] ?? 0
    if (x !== y) return x - y
  }
  return 0
}

export function UpdateBanner({
  currentVersion,
  dismissedVersion,
  onDismiss
}: {
  currentVersion: string
  dismissedVersion: string
  onDismiss: (version: string) => void
}): JSX.Element | null {
  const [snap, setSnap] = useState<AuthAndState | null>(null)

  useEffect(() => {
    void window.api.whyspr.snapshot().then(setSnap)
    const off = window.api.on.licenseState((s) => setSnap(s))
    return () => {
      off()
    }
  }, [])

  const latest = snap?.state?.latestVersion ?? null

  const showBanner = useMemo(() => {
    if (!latest) return false
    // Required updates go to the blocked window — banner skips them.
    if (snap?.state?.requiresUpdate) return false
    // Server hasn't found anything newer than what we're running.
    if (compareSemver(currentVersion, latest.version) >= 0) return false
    // User already dismissed this exact version.
    if (dismissedVersion === latest.version) return false
    return true
  }, [latest, currentVersion, dismissedVersion, snap?.state?.requiresUpdate])

  if (!showBanner || !latest) return null

  const downloadUrl = latest.downloadUrl.startsWith('http')
    ? latest.downloadUrl
    : `${BRAND.apiBaseUrl}${latest.downloadUrl}`

  function open(): void {
    void window.api.shell.openExternal(downloadUrl)
  }

  return (
    <div className="no-drag flex items-center justify-between gap-3 px-4 py-1.5 text-[11px] font-medium border-b bg-blue-500/10 border-blue-500/30 text-blue-100">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span>⬆️</span>
        <span className="truncate">
          Update available — v{latest.version}
          {latest.releaseNotes ? (
            <span className="text-blue-200/65"> · {latest.releaseNotes}</span>
          ) : null}
        </span>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={open}
          className="px-2 py-0.5 rounded-md bg-blue-500/30 hover:bg-blue-500/50 text-white font-semibold"
        >
          Download
        </button>
        <button
          type="button"
          onClick={() => onDismiss(latest.version)}
          title="Dismiss for this version"
          className="px-1.5 py-0.5 rounded-md text-blue-200/70 hover:bg-blue-500/20 hover:text-white text-sm leading-none"
        >
          ×
        </button>
      </div>
    </div>
  )
}
