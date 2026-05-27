/**
 * Login / logout against the Whyspr backend.
 *
 * The server route POST /api/auth/token returns a Bearer JWT we then
 * persist via the encrypted store. Logout just clears local state — there
 * is currently no server-side "revoke this JWT" endpoint, but tokens are
 * short-lived (1h) so this is acceptable.
 */
import { api } from './api'
import { saveSession, clearSession, loadSession } from './store'
import type { AuthSession } from '../../shared/license'

type TokenResp = {
  accessToken: string
  user: { id: string; email: string; name: string | null; role?: 'user' | 'admin' }
}

export type LoginResult =
  | { ok: true; user: AuthSession }
  | { ok: false; message: string; code: string }

export async function login(email: string, password: string): Promise<LoginResult> {
  const r = await api<TokenResp>('/api/auth/token', {
    method: 'POST',
    body: { email: email.trim().toLowerCase(), password },
    anonymous: true
  })
  if (!r.ok) {
    return { ok: false, message: r.message, code: r.code }
  }
  const session: AuthSession = {
    userId: r.body.user.id,
    email: r.body.user.email,
    name: r.body.user.name,
    role: r.body.user.role === 'admin' ? 'admin' : 'user',
    accessToken: r.body.accessToken,
    issuedAt: Date.now()
  }
  saveSession(session)
  return { ok: true, user: session }
}

export function logout(): void {
  clearSession()
}

export function currentSession(): AuthSession | null {
  return loadSession()
}
