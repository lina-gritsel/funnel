import { useQuery } from '@tanstack/react-query'
import type { FunnelVariantId } from '@funnel/contracts'
import { getProgress, getStep } from '@funnel/engine'
import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { fetchActiveFunnel } from '../api/funnel'
import { FunnelLayout } from '../components/funnel/FunnelLayout'
import { FunnelStepRenderer } from '../components/funnel/FunnelStepRenderer'
import { ProgressBar } from '../components/ui/ProgressBar'
import { useFunnelRuntimeStore } from '../store/funnel-runtime'

function requestedVariant(value: string | null): FunnelVariantId {
  return value === 'B' ? 'B' : 'A'
}

function FunnelRuntime() {
  const funnel = useFunnelRuntimeStore((state) => state.funnel)
  const trail = useFunnelRuntimeStore((state) => state.trail)
  const cursor = useFunnelRuntimeStore((state) => state.cursor)
  const answers = useFunnelRuntimeStore((state) => state.answers)
  const draft = useFunnelRuntimeStore((state) => state.draft)
  const error = useFunnelRuntimeStore((state) => state.error)
  const setDraft = useFunnelRuntimeStore((state) => state.setDraft)
  const submitCurrent = useFunnelRuntimeStore((state) => state.submitCurrent)
  const goBack = useFunnelRuntimeStore((state) => state.goBack)

  const currentStepId = trail[cursor]
  if (!funnel || !currentStepId) return null

  const step = getStep(funnel, currentStepId)
  const progress = getProgress(funnel, answers, cursor)

  return (
    <FunnelLayout progress={<ProgressBar current={progress.current} total={progress.total} />}>
      <FunnelStepRenderer
        key={step.id}
        step={step}
        draft={draft}
        error={error}
        canGoBack={cursor > 0}
        onDraftChange={setDraft}
        onContinue={() => {
          submitCurrent()
        }}
        onBack={goBack}
      />
    </FunnelLayout>
  )
}

export function FunnelPage() {
  const [searchParams] = useSearchParams()
  const variant = requestedVariant(searchParams.get('variant'))
  const initialize = useFunnelRuntimeStore((state) => state.initialize)
  const funnelQuery = useQuery({
    queryKey: ['active-funnel'],
    queryFn: fetchActiveFunnel,
    retry: 1
  })

  useEffect(() => {
    if (funnelQuery.data) initialize(funnelQuery.data, variant)
  }, [funnelQuery.data, initialize, variant])

  return (
    <div className="min-h-screen bg-canvas font-sans text-ink">
      <header className="bg-accent px-4 text-on-accent sm:px-6">
        <div className="mx-auto flex min-h-16 max-w-4xl items-center justify-between gap-4">
          <span className="text-sm font-semibold">Funnel Runtime</span>
          <div className="flex items-center gap-4 text-xs text-white/65">
            {funnelQuery.data ? (
              <span>
                v{funnelQuery.data.version} · вариант {variant}
              </span>
            ) : null}
            <Link className="transition-colors hover:text-white" to="/admin">
              Админка
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-4xl items-start px-4 py-10 sm:px-6 sm:py-16">
        {funnelQuery.isPending ? (
          <div className="w-full py-24 text-center text-sm text-muted">Загружаем воронку…</div>
        ) : null}

        {funnelQuery.isError ? (
          <div className="w-full border-l-2 border-danger py-2 pl-4">
            <h1 className="font-semibold">Не удалось загрузить воронку</h1>
            <p className="mt-1 text-sm text-muted">Проверьте соединение с backend.</p>
          </div>
        ) : null}

        {funnelQuery.data ? <FunnelRuntime /> : null}
      </main>
    </div>
  )
}
