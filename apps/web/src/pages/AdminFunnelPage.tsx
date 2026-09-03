import { useQuery } from '@tanstack/react-query'
import type {
  FunnelConfig,
  FunnelStepConfig,
  FunnelStepType,
  FunnelTransition,
  FunnelVariantId,
  FunnelVersionsResponse
} from '@funnel/contracts'

import { fetchActiveFunnel, fetchFunnelVersions } from '../api/funnel'
import { AdminLayout } from '../components/admin/AdminLayout'
import { FunnelVersionManager } from '../components/admin/FunnelVersionManager'

const stepTypeLabel: Record<FunnelStepType, string> = {
  info: 'Информация',
  'single-select': 'Один вариант',
  'multi-select': 'Несколько вариантов',
  number: 'Число',
  result: 'Результат'
}

const variantIds: FunnelVariantId[] = ['A', 'B']

function transitionLabel(transition: FunnelTransition | undefined) {
  if (!transition) return 'Финальный экран'
  if (transition.type === 'direct') return `Далее → ${transition.stepId}`

  const branches = transition.rules.map((rule) => `${rule.when.value} → ${rule.stepId}`)
  return `${branches.join(' · ')} · иначе → ${transition.fallbackStepId}`
}

function FunnelOverview({
  config,
  versions
}: {
  config: FunnelConfig
  versions: FunnelVersionsResponse
}) {
  const branchCount = config.steps.filter((step) => step.next?.type === 'branch').length

  return (
    <>
      <section className="border-b border-line pb-10 sm:pb-12">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="inline-flex items-center gap-2 font-semibold text-accent">
            <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" />
            Активная версия
          </span>
          <span className="text-muted">Опубликована {config.publishedAt?.slice(0, 10)}</span>
        </div>
        <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">
          {config.name}
        </h1>
        <div className="mt-7 flex flex-wrap gap-x-8 gap-y-3 text-sm">
          <p>
            <span className="text-muted">Версия</span>{' '}
            <strong className="font-semibold">v{config.version}</strong>
          </p>
          <p>
            <span className="text-muted">Экранов</span>{' '}
            <strong className="font-semibold">{config.steps.length}</strong>
          </p>
          <p>
            <span className="text-muted">Ветвлений</span>{' '}
            <strong className="font-semibold">{branchCount}</strong>
          </p>
          <p>
            <span className="text-muted">Старт</span>{' '}
            <strong className="font-semibold">{config.entryStepId}</strong>
          </p>
        </div>
      </section>

      <FunnelVersionManager data={versions} />

      <section className="grid gap-8 border-b border-line py-10 sm:py-12 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-16">
        <div>
          <p className="text-xs font-bold tracking-[0.12em] text-accent uppercase">Эксперимент</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">Варианты A и B</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Распределение и отличия внутри одной версии.
          </p>
        </div>
        <div>
          <dl className="grid gap-5 border-b border-line pb-7 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
                Гипотеза
              </dt>
              <dd className="mt-2 leading-6">{config.experiment.hypothesis}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
                Основная метрика
              </dt>
              <dd className="mt-2 font-medium">{config.experiment.primaryMetric}</dd>
            </div>
          </dl>
          <div className="divide-y divide-line">
            {variantIds.map((variantId) => {
              const variant = config.experiment.variants[variantId]
              const changedSteps = Object.keys(variant.stepOverrides)

              return (
                <div
                  key={variantId}
                  className="grid gap-3 py-6 sm:grid-cols-[52px_minmax(0,1fr)_100px] sm:items-start"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-sm font-bold text-on-accent">
                    {variantId}
                  </span>
                  <div>
                    <h3 className="font-semibold">{variant.name}</h3>
                    <p className="mt-1 text-sm leading-6 text-muted">{variant.description}</p>
                    <p className="mt-3 text-xs font-medium text-muted">
                      {changedSteps.length > 0
                        ? `Изменённые шаги: ${changedSteps.join(', ')}`
                        : 'Использует базовую конфигурацию'}
                    </p>
                  </div>
                  <p className="text-sm sm:text-right">
                    <strong className="text-xl font-semibold">{variant.weight}%</strong>
                    <span className="block text-muted">трафика</span>
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      <section className="grid gap-8 border-b border-line py-10 sm:py-12 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-16">
        <div>
          <p className="text-xs font-bold tracking-[0.12em] text-accent uppercase">Структура</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">Карта экранов</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Базовый порядок и условные переходы. Вариант B применяет отмеченные выше изменения.
          </p>
        </div>
        <ol className="divide-y divide-line border-y border-line">
          {config.steps.map((step, index) => (
            <StepRow key={step.id} step={step} index={index} />
          ))}
        </ol>
      </section>

      <section className="grid gap-8 py-10 sm:py-12 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-16">
        <div>
          <p className="text-xs font-bold tracking-[0.12em] text-accent uppercase">Источник</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">JSON-конфигурация</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Именно этот документ загрузил и проверил backend.
          </p>
        </div>
        <details className="group overflow-hidden rounded-panel border border-line bg-surface shadow-panel">
          <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-sm font-semibold outline-none transition-colors hover:bg-accent-soft focus-visible:bg-accent-soft sm:px-6">
            Показать исходный JSON
            <span
              className="text-muted transition-transform group-open:rotate-45"
              aria-hidden="true"
            >
              +
            </span>
          </summary>
          <pre className="max-h-[560px] overflow-auto border-t border-line bg-ink p-5 text-xs leading-6 text-white/80 sm:p-6">
            {JSON.stringify(config, null, 2)}
          </pre>
        </details>
      </section>
    </>
  )
}

function StepRow({ step, index }: { step: FunnelStepConfig; index: number }) {
  const isBranch = step.next?.type === 'branch'

  return (
    <li className="grid gap-3 py-5 transition-colors hover:bg-white/45 sm:grid-cols-[44px_150px_minmax(0,1fr)] sm:items-start sm:px-3">
      <span className="font-mono text-sm text-muted">{String(index + 1).padStart(2, '0')}</span>
      <div>
        <p className="text-xs font-semibold tracking-[0.06em] text-muted uppercase">
          {stepTypeLabel[step.type]}
        </p>
        <code className="mt-1 block text-xs text-accent">{step.id}</code>
      </div>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold">{step.title}</h3>
          {isBranch ? (
            <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-bold tracking-[0.05em] text-accent uppercase">
              Ветвление
            </span>
          ) : null}
        </div>
        <p className="mt-2 text-sm leading-5 text-muted">{transitionLabel(step.next)}</p>
      </div>
    </li>
  )
}

export function AdminFunnelPage() {
  const funnelQuery = useQuery({
    queryKey: ['active-funnel'],
    queryFn: fetchActiveFunnel,
    retry: 1
  })
  const versionsQuery = useQuery({
    queryKey: ['funnel-versions'],
    queryFn: fetchFunnelVersions,
    retry: 1
  })
  const isPending = funnelQuery.isPending || versionsQuery.isPending
  const isError = funnelQuery.isError || versionsQuery.isError

  return (
    <AdminLayout>
      {isPending ? (
        <div className="py-24 text-center text-sm text-muted">Загружаем конфигурацию…</div>
      ) : null}

      {isError ? (
        <div className="border-l-2 border-danger py-2 pl-4">
          <h1 className="font-semibold">Не удалось получить конфигурацию</h1>
          <p className="mt-1 text-sm text-muted">Проверьте, что backend доступен.</p>
        </div>
      ) : null}

      {funnelQuery.data && versionsQuery.data ? (
        <FunnelOverview config={funnelQuery.data} versions={versionsQuery.data} />
      ) : null}
    </AdminLayout>
  )
}
