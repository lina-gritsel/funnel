import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'

import { useAdminAuth } from './admin-auth-context'

type AdminLayoutProps = {
  children: ReactNode
}

const tabClass = ({ isActive }: { isActive: boolean }) =>
  `relative inline-flex min-h-12 items-center px-1 text-sm font-semibold transition-colors after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:origin-left after:bg-accent after:transition-transform ${
    isActive
      ? 'text-accent after:scale-x-100'
      : 'text-muted after:scale-x-0 hover:text-ink hover:after:scale-x-100'
  }`

export function AdminLayout({ children }: AdminLayoutProps) {
  const { logout } = useAdminAuth()

  return (
    <div className="min-h-screen bg-canvas font-sans text-ink">
      <header className="border-b border-line bg-surface px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="flex min-h-16 items-center justify-between gap-4 border-b border-line">
            <Link className="text-sm font-semibold" to="/">
              Funnel Runtime
            </Link>
            <div className="flex items-center gap-5">
              <Link className="text-sm text-muted transition-colors hover:text-ink" to="/dev/ui">
                UI foundation
              </Link>
              <button
                type="button"
                className="text-sm text-muted transition-colors hover:text-ink"
                onClick={logout}
              >
                Выйти
              </button>
            </div>
          </div>
          <nav className="flex gap-7" aria-label="Разделы админки">
            <NavLink className={tabClass} end to="/admin">
              Конфигурация
            </NavLink>
            <NavLink className={tabClass} to="/admin/analytics">
              Аналитика
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">{children}</main>
    </div>
  )
}
