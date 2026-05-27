/**
 * Thin fetch wrapper for the Whyspr backend.
 *
 * - Adds the bearer JWT automatically when present.
 * - Normalises errors into {ok, status, code, message, body}.
 * - Caller decides what to do on 401 / 403.
 */
import { apiBase } from './config'
import { loadSession } from './store'

export type ApiOk<T> = { ok: true; status: number; body: T }
export type ApiErr = {
  ok: false
  status: number
  /** Stable machine-readable code from the server, or 'network_error'. */
  code: string
  message: string
  body: unknown
}
export type ApiResult<T> = ApiOk<T> | ApiErr

export type ApiOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  /** When true, omits the Authorization header (used by /api/auth/token). */
  anonymous?: boolean
  /** Custom token override (used during login when token isn't stored yet). */
  token?: string
  /** Abort after this many ms — heartbeats use a tight timeout. */
  timeoutMs?: number
}

export async function api<T = unknown>(
  path: string,
  opts: ApiOptions = {}
): Promise<ApiResult<T>> {
  const url = `${apiBase()}${path.startsWith('/') ? '' : '/'}${path}`
  const headers: Record<string, string> = { 'content-type': 'application/json' }

  if (!opts.anonymous) {
    const token = opts.token ?? loadSession()?.accessToken
    if (token) headers['authorization'] = `Bearer ${token}`
  }

  const controller = new AbortController()
  const timeoutMs = opts.timeoutMs ?? 15000
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal
    })
    let body: unknown = null
    try {
      body = await res.json()
    } catch {
      body = null
    }
    if (res.ok) {
      return { ok: true, status: res.status, body: body as T }
    }
    const b = (body ?? {}) as Record<string, unknown>
    return {
      ok: false,
      status: res.status,
      code: typeof b.code === 'string' ? b.code : `http_${res.status}`,
      message:
        (typeof b.message === 'string' && b.message) ||
        (typeof b.error === 'string' && b.error) ||
        `Request failed (${res.status})`,
      body
    }
  } catch (err: any) {
    return {
      ok: false,
      status: 0,
      code: err?.name === 'AbortError' ? 'timeout' : 'network_error',
      message:
        err?.name === 'AbortError'
          ? 'The request took too long. Check your internet connection.'
          : `Could not reach Whyspr server. Check your internet connection.`,
      body: null
    }
  } finally {
    clearTimeout(timer)
  }
}
