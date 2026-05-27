/**
 * Slim banner shown at the top of the overlay when the license is about
 * to expire (or just expired and the heartbeat is about to land). For
 * fully expired / suspended / no-license states the blocked window takes
 * over — this component only handles the "about to" + "trial" cases.
 */
import { useEffect, useState } from 'react'
import { BRAND } from '@shared/branding'
import type { AuthAndState } from '@shared/license'

const TRIAL_BANNER_DAYS = 7

export function LicenseBanner(): JSX.Element | null {
  const [snap, setSnap] = useState<AuthAndState | null>(null)

  useEffect(() => {
    void window.api.whyspr.snapshot().then(setSnap)
    const off = window.api.on.licenseState((s) => setSnap(s))
    return () => {
      off()
    }
  }, [])

  const s = snap?.state
  if (!s) return null
  // Hard-blocked states render via the blocked window, not this banner.
  if (!s.allowsAppAccess) return null
  if (s.daysRemaining === null) return null
  if (s.daysRemaining > TRIAL_BANNER_DAYS) return null

  const tone: 'warn' | 'info' = s.daysRemaining <= 3 ? 'warn' : 'info'
  const colour =
    tone === 'warn'
      ? 'bg-amber-500/15 border-amber-500/30 text-amber-200'
      : 'bg-emerald-500/10 border-emerald-500/25 text-emerald-200'

  const label = s.state === 'trial' ? 'Trial' : (s.plan ?? 'Plan')
  const phrase =
    s.daysRemaining === 0
      ? 'ends today'
      : s.daysRemaining === 1
        ? 'ends in 1 day'
        : `ends in ${s.daysRemaining} days`

  function upgrade(): void {
    void window.api.shell.openExternal(BRAND.upgradeUrl)
  }

  return (
    <div
      className={`no-drag flex items-center justify-between gap-3 px-4 py-1.5 text-[11px] font-medium border-b ${colour}`}
    >
      <span className="truncate">
        {label} {phrase}
      </span>
      <button
        type="button"
        onClick={upgrade}
        className="shrink-0 px-2 py-0.5 rounded-md bg-black/30 hover:bg-black/50 text-white/90 font-semibold"
      >
        Upgrade →
      </button>
    </div>
  )
}
