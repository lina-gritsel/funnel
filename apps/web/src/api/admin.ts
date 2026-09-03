const storageKey = 'funnel-admin-token'

export function getAdminToken() {
  return window.sessionStorage.getItem(storageKey) ?? ''
}

export function storeAdminToken(token: string) {
  window.sessionStorage.setItem(storageKey, token)
}

export function clearAdminToken() {
  window.sessionStorage.removeItem(storageKey)
}

export function adminHeaders(initial?: HeadersInit) {
  const headers = new Headers(initial)
  const token = getAdminToken()
  if (token) headers.set('x-admin-token', token)
  return headers
}

export async function authenticateAdmin(token = getAdminToken()) {
  const headers = new Headers()
  if (token) headers.set('x-admin-token', token)

  const response = await fetch('/api/admin/session', { headers })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: unknown } | null
    const fallback = response.status === 503 ? 'Доступ к админке отключён' : 'Неверный токен'
    throw new Error(typeof body?.message === 'string' ? body.message : fallback)
  }

  return response.json() as Promise<{
    authenticated: true
    protection: 'token' | 'development-open'
  }>
}
