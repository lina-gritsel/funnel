import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import { fetchHealth } from '../api/health'

type HealthState = 'checking' | 'available' | 'unavailable'

const healthDotClass: Record<HealthState, string> = {
  checking: 'bg-warning',
  available: 'bg-success',
  unavailable: 'bg-danger'
}

const healthLabel: Record<HealthState, string> = {
  checking: 'Проверяем соединение…',
  available: 'Подключён',
  unavailable: 'Недоступен'
}

export function HomePage() {
  const healthQuery = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    retry: 1
  })
  const health: HealthState = healthQuery.isPending
    ? 'checking'
    : healthQuery.isError
      ? 'unavailable'
      : 'available'

  return (
    <main className="min-h-screen bg-canvas px-4 py-[clamp(4.5rem,14vh,9rem)] font-sans text-ink sm:px-5">
      <div className="mx-auto max-w-3xl">
        <p className="mb-3.5 text-xs font-bold tracking-[0.12em] text-muted uppercase">
          Fullstack workspace
        </p>
        <h1 className="text-[clamp(2.6rem,8vw,5.75rem)] leading-[0.95] font-semibold tracking-[-0.065em]">
          Funnel Runtime
        </h1>
        <p className="mt-7 mb-9 max-w-xl text-[clamp(1rem,2.4vw,1.2rem)] leading-[1.55] text-muted">
          Каркас приложения и общая UI-система для динамических воронок.
        </p>
        <Link
          className="mb-12 inline-flex min-h-12 items-center rounded-control bg-accent px-5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:outline-none"
          to="/dev/ui"
        >
          Открыть UI foundation
        </Link>
        <div className="grid w-full grid-cols-[10px_auto_1fr] items-center gap-3 border-t border-line pt-[18px] text-sm text-muted sm:w-fit sm:min-w-[250px]">
          <span className={`h-2 w-2 rounded-full ${healthDotClass[health]}`} aria-hidden="true" />
          <strong className="font-semibold text-ink">API</strong>
          <span>{healthLabel[health]}</span>
        </div>
      </div>
    </main>
  )
}
