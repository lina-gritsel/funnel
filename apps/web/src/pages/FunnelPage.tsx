import { useMutation, useQuery } from '@tanstack/react-query'
import type { FunnelVariantId, SubmitAnswerRequest } from '@funnel/contracts'
import { getProgress, getStep } from '@funnel/engine'
import { useEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { bootstrapSession, moveSessionBack, submitSessionAnswer } from '../api/session'
import { flushEvents, trackEvent } from '../analytics/event-queue'
import { FunnelLayout } from '../components/funnel/FunnelLayout'
import { FunnelStepRenderer } from '../components/funnel/FunnelStepRenderer'
import { ProgressBar } from '../components/ui/ProgressBar'
import { useFunnelRuntimeStore } from '../store/funnel-runtime'

function requestedVariant(value: string | null): FunnelVariantId | undefined {
  return value === 'A' || value === 'B' ? value : undefined
}

function collectUtm(searchParams: URLSearchParams): Record<string, string> {
  return Object.fromEntries(
    [...searchParams.entries()].filter(([key, value]) => key.startsWith('utm_') && value)
  )
}

function FunnelRuntime() {
  const session = useFunnelRuntimeStore((state) => state.session)
  const funnel = useFunnelRuntimeStore((state) => state.funnel)
  const trail = useFunnelRuntimeStore((state) => state.trail)
  const cursor = useFunnelRuntimeStore((state) => state.cursor)
  const answers = useFunnelRuntimeStore((state) => state.answers)
  const draft = useFunnelRuntimeStore((state) => state.draft)
  const error = useFunnelRuntimeStore((state) => state.error)
  const setDraft = useFunnelRuntimeStore((state) => state.setDraft)
  const validateDraft = useFunnelRuntimeStore((state) => state.validateDraft)
  const applySession = useFunnelRuntimeStore((state) => state.applySession)
  const setError = useFunnelRuntimeStore((state) => state.setError)

  const submitMutation = useMutation({
    mutationFn: (input: { request: SubmitAnswerRequest }) => {
      if (!session) throw new Error('Сессия ещё не готова')
      return submitSessionAnswer(session.id, input.request)
    },
    onSuccess: ({ session: updatedSession }) => {
      if (!session || !funnel) return

      applySession(updatedSession)
      trackEvent({
        sessionId: session.id,
        name: 'step_viewed',
        stepId: updatedSession.currentStepId,
        properties: { view_reason: 'forward' }
      })
      if (getStep(funnel, updatedSession.currentStepId).type === 'result') {
        trackEvent({
          sessionId: session.id,
          name: 'result_viewed',
          stepId: updatedSession.currentStepId
        })
      }
    },
    onError: (mutationError) => setError(mutationError.message)
  })

  const backMutation = useMutation({
    mutationFn: (input: { fromStepId: string }) => {
      if (!session) throw new Error('Сессия ещё не готова')
      if (input.fromStepId !== session.currentStepId) {
        throw new Error('Шаг уже изменился')
      }
      return moveSessionBack(session.id)
    },
    onSuccess: ({ session: updatedSession }) => {
      if (!session) return
      applySession(updatedSession)
      trackEvent({
        sessionId: session.id,
        name: 'step_viewed',
        stepId: updatedSession.currentStepId,
        properties: { view_reason: 'back' }
      })
    },
    onError: (mutationError) => setError(mutationError.message)
  })

  const currentStepId = trail[cursor]
  if (!funnel || !session || !currentStepId) return null

  const step = getStep(funnel, currentStepId)
  const progress = getProgress(funnel, answers, cursor)
  const isLoading = submitMutation.isPending || backMutation.isPending

  return (
    <FunnelLayout progress={<ProgressBar current={progress.current} total={progress.total} />}>
      <FunnelStepRenderer
        key={step.id}
        step={step}
        draft={draft}
        error={error}
        canGoBack={cursor > 0}
        isLoading={isLoading}
        onDraftChange={setDraft}
        onContinue={() => {
          const validation = validateDraft()
          if (!validation.success) return

          submitMutation.mutate({
            request: {
              stepId: currentStepId,
              ...(validation.data !== undefined ? { answer: validation.data } : {})
            }
          })
        }}
        onBack={() =>
          backMutation.mutate({
            fromStepId: currentStepId
          })
        }
        onCta={() => {
          trackEvent({
            sessionId: session.id,
            name: 'cta_clicked',
            stepId: currentStepId,
            properties: { cta_id: 'primary' }
          })
          void flushEvents()
          if (step.type === 'result') {
            window.open(step.cta.href, '_blank', 'noopener,noreferrer')
          }
        }}
      />
    </FunnelLayout>
  )
}

export function FunnelPage() {
  const [searchParams] = useSearchParams()
  const variant = requestedVariant(searchParams.get('variant'))
  const hydrate = useFunnelRuntimeStore((state) => state.hydrate)
  const trackedBootstrap = useRef<string | null>(null)
  const utm = collectUtm(searchParams)
  const sessionQuery = useQuery({
    queryKey: ['funnel-session', variant ?? 'assigned'],
    queryFn: ({ signal }) => bootstrapSession({ ...(variant ? { variant } : {}), utm, signal }),
    retry: 1
  })

  useEffect(() => {
    if (!sessionQuery.data) return
    hydrate(sessionQuery.data)

    const { session, config, viewReason } = sessionQuery.data
    if (trackedBootstrap.current === session.id) return
    trackedBootstrap.current = session.id

    trackEvent({
      sessionId: session.id,
      name: 'step_viewed',
      stepId: session.currentStepId,
      properties: { view_reason: viewReason }
    })
    if (config.steps.find((step) => step.id === session.currentStepId)?.type === 'result') {
      trackEvent({
        sessionId: session.id,
        name: 'result_viewed',
        stepId: session.currentStepId
      })
    }
  }, [hydrate, sessionQuery.data])

  return (
    <div className="min-h-screen bg-canvas font-sans text-ink">
      <header className="bg-accent px-4 text-on-accent sm:px-6">
        <div className="mx-auto flex min-h-16 max-w-4xl items-center justify-between gap-4">
          <span className="text-sm font-semibold">Funnel Runtime</span>
          <div className="flex items-center gap-4 text-xs text-white/65">
            {sessionQuery.data ? (
              <span>
                v{sessionQuery.data.session.version} · вариант {sessionQuery.data.session.variant}
              </span>
            ) : null}
            <Link className="transition-colors hover:text-white" to="/admin">
              Админка
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-4xl items-start px-4 py-10 sm:px-6 sm:py-16">
        {sessionQuery.isPending ? (
          <div className="w-full py-24 text-center text-sm text-muted">Загружаем воронку…</div>
        ) : null}

        {sessionQuery.isError ? (
          <div className="w-full border-l-2 border-danger py-2 pl-4">
            <h1 className="font-semibold">Не удалось загрузить воронку</h1>
            <p className="mt-1 text-sm text-muted">{sessionQuery.error.message}</p>
          </div>
        ) : null}

        {sessionQuery.data ? <FunnelRuntime /> : null}
      </main>
    </div>
  )
}
