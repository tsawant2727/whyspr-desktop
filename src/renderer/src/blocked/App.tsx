import { useEffect, useState } from 'react'
import { BRAND } from '@shared/branding'
import type { AuthAndState, LicenseState, ActiveDeviceSummary } from '@shared/license'

type Mode =
  | {
      kind: 'expired' | 'cancelled' | 'paused' | 'no_license' | 'suspended'
      state: LicenseState
      message: string
    }
  | { kind: 'update_required'; version: string; downloadUrl: string }
  | {
      kind: 'device_conflict'
      message: string
      activeDevices: ActiveDeviceSummary[]
    }
  | { kind: 'checking' }
  | { kind: 'cant_reach'; error: string | null }

export default function App(): JSX.Element {
  const [snap, setSnap] = useState<AuthAndState | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [waited, setWaited] = useState(false)

  useEffect(() => {
    // Pull whatever the main process has right now…
    void window.api.whyspr.snapshot().then(setSnap)
    // …and listen for any updates.
    const off = window.api.on.licenseState((s) => setSnap(s))
    // If we have no usable state after 2s, switch the UI to a recoverable
    // "couldn't reach server" view so the user is never stuck on a spinner.
    const t = setTimeout(() => setWaited(true), 2000)
    return () => {
      off()
      clearTimeout(t)
    }
  }, [])

  const mode = deriveMode(snap, waited)

  async function refresh(): Promise<void> {
    setRefreshing(true)
    try {
      const next = await window.api.whyspr.refresh()
      setSnap(next)
    } finally {
      setRefreshing(false)
    }
  }

  async function signOut(): Promise<void> {
    await window.api.whyspr.logout()
  }

  function openExternal(url: string): void {
    void window.api.shell.openExternal(url)
  }

  if (mode.kind === 'checking') {
    return (
      <Shell>
        <Heading icon="⏳" title="Checking your subscription…" />
        <p className="text-sm text-white/65">One moment.</p>
      </Shell>
    )
  }

  if (mode.kind === 'cant_reach') {
    return (
      <Shell>
        <Heading icon="📡" title="Couldn't reach Whispy" />
        <p className="text-sm text-white/70 mb-3">
          We can&apos;t talk to the Whispy server right now. Check your internet
          connection and try again.
        </p>
        {mode.error && (
          <p className="text-[11px] text-white/40 mb-4 font-mono break-all">
            {mode.error}
          </p>
        )}
        <Cta primary onClick={refresh}>
          {refreshing ? 'Retrying…' : 'Retry'}
        </Cta>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <Secondary onClick={() => openExternal(BRAND.supportUrl)}>
            Contact support
          </Secondary>
          <Secondary onClick={signOut}>Sign out</Secondary>
        </div>
        {snap?.user && (
          <p className="mt-5 text-[11px] text-white/35 text-center">
            Signed in as <span className="text-white/55">{snap.user.email}</span>
          </p>
        )}
      </Shell>
    )
  }

  if (mode.kind === 'device_conflict') {
    return (
      <Shell>
        <Heading icon="🖥" title="Signed in on another device" />
        <p className="text-sm text-white/70 mb-4">{mode.message}</p>

        {mode.activeDevices.length > 0 && (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 mb-4 space-y-2">
            <div className="text-[10px] uppercase tracking-wider text-white/45 font-semibold">
              Currently signed in
            </div>
            {mode.activeDevices.map((d) => (
              <div key={d.id} className="flex items-center justify-between text-xs">
                <div>
                  <div className="font-medium text-white/90">{d.deviceName}</div>
                  <div className="text-white/45 capitalize">
                    {d.platform} · last active{' '}
                    {new Date(d.lastActiveAt).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <Cta primary onClick={() => openExternal(`${BRAND.dashboardUrl}/devices`)}>
          Revoke that device →
        </Cta>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <Secondary onClick={refresh} disabled={refreshing}>
            {refreshing ? 'Checking…' : "I've revoked it — try again"}
          </Secondary>
          <Secondary onClick={signOut}>Sign out</Secondary>
        </div>

        {snap?.user && (
          <p className="mt-5 text-[11px] text-white/35 text-center">
            Signed in as <span className="text-white/55">{snap.user.email}</span>
          </p>
        )}
      </Shell>
    )
  }

  if (mode.kind === 'update_required') {
    return (
      <Shell>
        <Heading icon="⬆️" title="Update required" />
        <p className="text-sm text-white/70 mb-5">
          A new version of {BRAND.productName} is required. Please update to continue.
          <br />
          <span className="text-white/45">New version: {mode.version}</span>
        </p>
        <Cta primary onClick={() => openExternal(mode.downloadUrl)}>
          Download update →
        </Cta>
        <Secondary onClick={refresh} disabled={refreshing}>
          {refreshing ? 'Checking…' : "I've updated — check again"}
        </Secondary>
      </Shell>
    )
  }

  const copy = COPY[mode.kind]
  return (
    <Shell>
      <Heading icon={copy.icon} title={copy.title} />
      <p className="text-sm text-white/70 mb-4">{mode.message || copy.body}</p>

      {snap?.user && (
        <p className="text-xs text-white/40 mb-5">
          Signed in as <span className="text-white/70">{snap.user.email}</span>
        </p>
      )}

      <Cta primary onClick={() => openExternal(BRAND.upgradeUrl)}>
        {copy.primaryCta}
      </Cta>

      <div className="grid grid-cols-2 gap-2 mt-2">
        <Secondary onClick={refresh} disabled={refreshing}>
          {refreshing ? 'Checking…' : 'Refresh status'}
        </Secondary>
        <Secondary onClick={signOut}>Sign out</Secondary>
      </div>

      <div className="mt-6 pt-5 border-t border-white/5 text-[11px] text-white/40 text-center">
        Trouble?{' '}
        <button
          className="underline hover:text-white/65"
          onClick={() => openExternal(BRAND.supportUrl)}
        >
          Contact support
        </button>
      </div>
    </Shell>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

const COPY = {
  expired: {
    icon: '⏰',
    title: 'Your subscription has expired',
    body: 'Renew to continue using Whispy.',
    primaryCta: 'Renew subscription →'
  },
  cancelled: {
    icon: '🛑',
    title: 'Subscription cancelled',
    body: 'Reactivate from your dashboard to keep using Whispy.',
    primaryCta: 'Reactivate →'
  },
  paused: {
    icon: '⏸',
    title: 'Subscription paused',
    body: 'Resume your subscription to continue.',
    primaryCta: 'Resume →'
  },
  no_license: {
    icon: '✨',
    title: 'Pick a plan to get started',
    body: 'Your account does not have an active license.',
    primaryCta: 'View plans →'
  },
  suspended: {
    icon: '🚫',
    title: 'Account suspended',
    body:
      'This account has been suspended. Contact support if you believe this is a mistake.',
    primaryCta: 'Contact support →'
  }
} as const

function deriveMode(snap: AuthAndState | null, waited: boolean): Mode {
  // Hard "checking…" for the first 2 seconds — gives the main process time to
  // hand us a snapshot. After that we surface a recoverable error state.
  if (!snap && !waited) return { kind: 'checking' }
  if (snap && !snap.user && snap.lastError) {
    return { kind: 'suspended', state: 'suspended', message: snap.lastError }
  }
  const s = snap?.state ?? null
  if (!s) {
    // Server unreachable, schema mismatch, deploy out-of-date, etc.
    return waited
      ? { kind: 'cant_reach', error: snap?.lastError ?? null }
      : { kind: 'checking' }
  }
  if (s.requiresUpdate && s.latestVersion) {
    return {
      kind: 'update_required',
      version: s.latestVersion.version,
      downloadUrl: s.latestVersion.downloadUrl.startsWith('http')
        ? s.latestVersion.downloadUrl
        : `${BRAND.apiBaseUrl}${s.latestVersion.downloadUrl}`
    }
  }
  if (s.state === 'device_conflict') {
    return {
      kind: 'device_conflict',
      message: s.message,
      activeDevices: s.activeDevices ?? []
    }
  }
  if (
    s.state === 'expired' ||
    s.state === 'cancelled' ||
    s.state === 'paused' ||
    s.state === 'no_license' ||
    s.state === 'suspended'
  ) {
    return { kind: s.state, state: s.state, message: s.message }
  }
  // Healthy state somehow made it into the blocked window — surface the same
  // "can't reach" recovery UI rather than a useless spinner.
  return { kind: 'cant_reach', error: snap?.lastError ?? null }
}

function Shell({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="h-screen w-screen bg-[#0b0f17] text-[#e6edf3] flex items-center justify-center px-8">
      <div className="w-full max-w-md">{children}</div>
    </div>
  )
}

function Heading({ icon, title }: { icon: string; title: string }): JSX.Element {
  return (
    <div className="mb-4">
      <div className="text-4xl mb-3">{icon}</div>
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
    </div>
  )
}

function Cta({
  children,
  onClick,
  primary
}: {
  children: React.ReactNode
  onClick: () => void
  primary?: boolean
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`w-full py-2.5 rounded-lg font-semibold text-sm transition-colors ${
        primary
          ? 'bg-emerald-500 hover:bg-emerald-400 text-black'
          : 'bg-white/5 hover:bg-white/10 text-white border border-white/10'
      }`}
    >
      {children}
    </button>
  )
}

function Secondary({
  children,
  onClick,
  disabled
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full py-2 rounded-lg text-xs text-white/75 hover:text-white bg-white/[0.03] border border-white/10 hover:bg-white/[0.06] disabled:opacity-40 transition-colors"
    >
      {children}
    </button>
  )
}
