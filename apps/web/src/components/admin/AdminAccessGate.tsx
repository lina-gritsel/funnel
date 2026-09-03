import { type FormEvent, type ReactNode, useEffect, useState } from 'react'

import { authenticateAdmin, clearAdminToken, getAdminToken, storeAdminToken } from '../../api/admin'
import { Button } from '../ui/Button'
import { AdminAuthContext } from './admin-auth-context'

export function AdminAccessGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<'checking' | 'login' | 'authorized'>('checking')
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    const savedToken = getAdminToken()
    void authenticateAdmin(savedToken)
      .then(() => setStatus('authorized'))
      .catch((authenticationError: unknown) => {
        clearAdminToken()
        setError(authenticationError instanceof Error ? authenticationError.message : '')
        setStatus('login')
      })
  }, [])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)
    try {
      await authenticateAdmin(token.trim())
      storeAdminToken(token.trim())
      setStatus('authorized')
    } catch (authenticationError) {
      clearAdminToken()
      setError(
        authenticationError instanceof Error
          ? authenticationError.message
          : 'Не удалось проверить токен'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  if (status === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas px-4 font-sans text-ink">
        <p className="text-sm text-muted">Проверяем доступ к админке…</p>
      </div>
    )
  }

  if (status === 'login') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas px-4 font-sans text-ink">
        <main className="w-full max-w-md rounded-panel border border-line bg-surface p-7 shadow-panel sm:p-9">
          <p className="text-xs font-bold tracking-[0.12em] text-accent uppercase">
            Закрытый раздел
          </p>
          <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em]">Вход в админку</h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            Введите токен администратора, настроенный на сервере.
          </p>
          <form className="mt-7" onSubmit={submit}>
            <label className="block text-sm font-semibold" htmlFor="admin-token">
              Admin token
            </label>
            <input
              id="admin-token"
              type="password"
              autoComplete="current-password"
              className="mt-2 min-h-12 w-full rounded-control border border-line bg-white px-4 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15"
              value={token}
              onChange={(event) => setToken(event.target.value)}
            />
            {error ? (
              <p className="mt-4 border-l-2 border-danger pl-3 text-sm text-danger">{error}</p>
            ) : null}
            <Button
              className="mt-6 w-full"
              type="submit"
              isLoading={isSubmitting}
              disabled={!token.trim()}
            >
              Войти
            </Button>
          </form>
        </main>
      </div>
    )
  }

  return (
    <AdminAuthContext.Provider
      value={{
        logout: () => {
          clearAdminToken()
          setToken('')
          setError('')
          setStatus('login')
        }
      }}
    >
      {children}
    </AdminAuthContext.Provider>
  )
}
