import { AdminLayout } from '../components/admin/AdminLayout'

const futureMetrics = [
  {
    index: '01',
    title: 'Трафик',
    description: 'Количество уникальных сессий и распределение между вариантами A и B.'
  },
  {
    index: '02',
    title: 'Переходы',
    description: 'Конверсия между доступными шагами и точки выхода из воронки.'
  },
  {
    index: '03',
    title: 'Результат и CTA',
    description: 'Доля пользователей, дошедших до результата и нажавших основную кнопку.'
  },
  {
    index: '04',
    title: 'Сравнение A/B',
    description: 'Основная метрика эксперимента отдельно для каждого варианта.'
  }
]

export function AdminAnalyticsPage() {
  return (
    <AdminLayout>
      <section className="border-b border-line pb-10 sm:pb-12">
        <p className="text-xs font-bold tracking-[0.12em] text-accent uppercase">Аналитика</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">
          Прохождение воронки
        </h1>
        <p className="mt-4 max-w-2xl leading-7 text-muted">
          Здесь будут собраны трафик, переходы между шагами и сравнение вариантов эксперимента.
        </p>
      </section>

      <section className="grid gap-8 border-b border-line py-10 sm:py-12 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-16">
        <div>
          <p className="text-xs font-bold tracking-[0.12em] text-accent uppercase">
            Текущее состояние
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">Данных пока нет</h2>
        </div>
        <div className="border-y border-line py-8">
          <div className="flex items-start gap-3">
            <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-warning" aria-hidden="true" />
            <div>
              <h3 className="font-semibold">Сбор событий ещё не подключён</h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                Метрики появятся после реализации сессий и событий. До этого момента интерфейс не
                подставляет демонстрационные значения и не создаёт ложное впечатление о трафике.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-8 py-10 sm:py-12 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-16">
        <div>
          <p className="text-xs font-bold tracking-[0.12em] text-accent uppercase">
            Состав раздела
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">Что здесь появится</h2>
        </div>
        <ol className="divide-y divide-line border-y border-line">
          {futureMetrics.map((metric) => (
            <li
              key={metric.index}
              className="grid gap-2 py-5 transition-colors hover:bg-white/45 sm:grid-cols-[48px_170px_minmax(0,1fr)] sm:px-3"
            >
              <span className="font-mono text-sm text-muted">{metric.index}</span>
              <h3 className="font-semibold">{metric.title}</h3>
              <p className="text-sm leading-6 text-muted">{metric.description}</p>
            </li>
          ))}
        </ol>
      </section>
    </AdminLayout>
  )
}
