import { useState } from 'react'
import { BRAND } from '@shared/branding'

export default function App(): JSX.Element {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setErr(null)
    setLoading(true)
    try {
      const r = await window.api.whyspr.login(email, password)
      if (!r.ok) {
        setErr(r.message)
        return
      }
      // Main process is closing this window + opening overlay after success.
    } catch (e: any) {
      setErr(e?.message ?? 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  function openExternal(url: string): void {
    void window.api.shell.openExternal(url)
  }

  return (
    <div className="h-full w-full bg-[#0b0f17] text-[#e6edf3] flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-7">
          <div className="text-2xl font-bold tracking-tight">
            {BRAND.productName}
            <span className="text-emerald-400">.</span>
          </div>
          <div className="text-xs text-white/45 mt-1">{BRAND.tagline}</div>
        </div>

        <form onSubmit={submit} className="space-y-3.5">
          <Field label="Email">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              autoComplete="email"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 focus:border-emerald-500 outline-none text-sm"
            />
          </Field>
          <Field label="Password">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 focus:border-emerald-500 outline-none text-sm"
            />
          </Field>

          {err && (
            <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              {err}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-semibold py-2.5 rounded-lg disabled:opacity-50 transition-colors"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="mt-5 text-center space-y-2 text-xs">
          <button
            type="button"
            onClick={() => openExternal(BRAND.signupUrl)}
            className="text-white/65 hover:text-white"
          >
            New here? <span className="text-emerald-400 hover:text-emerald-300">Create an account →</span>
          </button>
          <div>
            <button
              type="button"
              onClick={() => openExternal(BRAND.loginUrl)}
              className="text-white/40 hover:text-white/70"
            >
              Forgot password? Use the web sign-in
            </button>
          </div>
        </div>

        <div className="mt-8 text-center text-[10px] text-white/30">
          By signing in you agree to our{' '}
          <a className="underline" onClick={(e) => { e.preventDefault(); openExternal(`${BRAND.websiteUrl}/terms`) }} href="#">Terms</a>
          {' '}and{' '}
          <a className="underline" onClick={(e) => { e.preventDefault(); openExternal(`${BRAND.websiteUrl}/privacy`) }} href="#">Privacy</a>.
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-wider text-white/55 font-semibold mb-1">
        {label}
      </span>
      {children}
    </label>
  )
}
