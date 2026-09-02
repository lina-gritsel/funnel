import { useQuery } from '@tanstack/react-query'
import type { AnalyticsResponse } from '@funnel/contracts'
import { useState } from 'react'

import { fetchAnalytics } from '../api/analytics'
import { AdminLayout } from '../components/admin/AdminLayout'
import { Select } from '../components/ui/Select'

function percent(value: number) {
  return `${value.toLocaleString('ru-RU')}%`
}

function AnalyticsContent({ data }: { data: AnalyticsResponse }) {
  const summary = [
    { label: 'Начали воронку', value: data.totals.sessionsStarted.toLocaleString('ru-RU') },
    { label: 'Дошли до результата', value: percent(data.totals.resultRate) },
    { label: 'Увидели результат', value: data.totals.resultReached.toLocaleString('ru-RU') },
    { label: 'CTR основной CTA', value: percent(data.totals.ctaCtr) }
  ]

  return (
    <>
      <section className="grid border-y border-line sm:grid-cols-2 lg:grid-cols-4">
        {summary.map((metric) => (
          <div
            key={metric.label}
            className="border-b border-line py-6 sm:px-5 lg:border-b-0 lg:border-l lg:first:border-l-0"
          >
            <p className="text-3xl font-semibold tracking-[-0.04em]">{metric.value}</p>
            <p className="mt-2 text-sm text-muted">{metric.label}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-8 border-b border-line py-10 sm:py-12 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-16">
        <div>
          <p className="text-xs font-bold tracking-[0.12em] text-accent uppercase">Эксперимент</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">Сравнение A и B</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Показатели рассчитаны по уникальным сессиям.
          </p>
        </div>
        <div className="divide-y divide-line border-y border-line">
          {data.variants.map((variant) => (
            <div
              key={variant.variant}
              className="grid gap-4 py-6 sm:grid-cols-[52px_repeat(3,minmax(0,1fr))] sm:items-center"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-sm font-bold text-on-accent">
                {variant.variant}
              </span>
              <Metric label="Сессии" value={variant.sessionsStarted} />
              <Metric label="Результат" value={percent(variant.resultRate)} />
              <Metric label="CTR" value={percent(variant.ctaCtr)} />
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-8 border-b border-line py-10 sm:py-12 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-16">
        <div>
          <p className="text-xs font-bold tracking-[0.12em] text-accent uppercase">Переходы</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">Шаги воронки</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Отвал — сессии, увидевшие шаг, но не завершившие его.
          </p>
        </div>
        <ol className="divide-y divide-line border-y border-line">
          {data.steps.map((step, index) => (
            <li key={step.stepId} className="py-5">
              <div className="grid gap-2 sm:grid-cols-[36px_minmax(0,1fr)_80px_80px_88px] sm:items-center">
                <span className="font-mono text-xs text-muted">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div>
                  <p className="font-semibold">{step.title}</p>
                  <code className="text-xs text-accent">{step.stepId}</code>
                </div>
                <Metric label="Просмотры" value={step.viewed} compact />
                <Metric label="Отвал" value={step.dropoff} compact />
                <Metric label="Конверсия" value={percent(step.conversionRate)} compact />
              </div>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-line sm:ml-9">
                <div
                  className="h-full rounded-full bg-accent transition-[width]"
                  style={{ width: `${Math.min(step.conversionRate, 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-8 py-10 sm:py-12 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-16">
        <div>
          <p className="text-xs font-bold tracking-[0.12em] text-accent uppercase">Версии</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">Сравнение запусков</h2>
        </div>
        {data.versions.length ? (
          <div className="divide-y divide-line border-y border-line">
            {data.versions.map((version) => (
              <div
                key={version.version}
                className="grid gap-3 py-5 sm:grid-cols-[80px_repeat(3,minmax(0,1fr))]"
              >
                <strong>v{version.version}</strong>
                <Metric label="Сессии" value={version.sessionsStarted} compact />
                <Metric label="Результат" value={percent(version.resultRate)} compact />
                <Metric label="CTR" value={percent(version.ctaCtr)} compact />
              </div>
            ))}
          </div>
        ) : (
          <p className="border-y border-line py-6 text-sm text-muted">Событий пока нет.</p>
        )}
      </section>
    </>
  )
}

function Metric({
  label,
  value,
  compact = false
}: {
  label: string
  value: number | string
  compact?: boolean
}) {
  return (
    <div>
      <p className={compact ? 'text-sm font-semibold' : 'text-xl font-semibold'}>{value}</p>
      <p className="mt-0.5 text-xs text-muted">{label}</p>
    </div>
  )
}

export function AdminAnalyticsPage() {
  const [campaign, setCampaign] = useState('')
  const analyticsQuery = useQuery({
    queryKey: ['analytics', campaign],
    queryFn: ({ signal }) => fetchAnalytics({ ...(campaign ? { campaign } : {}), signal }),
    refetchInterval: 5000
  })

  return (
    <AdminLayout>
      <section className="flex flex-col gap-7 border-b border-line pb-10 sm:pb-12 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold tracking-[0.12em] text-accent uppercase">Аналитика</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">
            Прохождение воронки
          </h1>
          <p className="mt-4 max-w-2xl leading-7 text-muted">
            Реальные события, конверсия шагов и результат эксперимента.
          </p>
        </div>
        <Select
          id="utm-campaign"
          label="UTM campaign"
          className="w-full lg:w-64"
          value={campaign}
          onChange={(event) => setCampaign(event.target.value)}
        >
          <option value="">Все кампании</option>
          {analyticsQuery.data?.campaigns.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </Select>
      </section>

      {analyticsQuery.isPending ? (
        <div className="py-24 text-center text-sm text-muted">Считаем показатели…</div>
      ) : null}
      {analyticsQuery.isError ? (
        <div className="border-l-2 border-danger py-2 pl-4">
          <h2 className="font-semibold">Не удалось получить аналитику</h2>
          <p className="mt-1 text-sm text-muted">Проверьте соединение с backend.</p>
        </div>
      ) : null}
      {analyticsQuery.data ? <AnalyticsContent data={analyticsQuery.data} /> : null}
    </AdminLayout>
  )
}
