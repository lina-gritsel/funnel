import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { FunnelLayout } from '../components/funnel/FunnelLayout'
import { StepActions } from '../components/funnel/StepActions'
import { InfoStep } from '../components/funnel/steps/InfoStep'
import { MultiSelectStep } from '../components/funnel/steps/MultiSelectStep'
import { NumberStep } from '../components/funnel/steps/NumberStep'
import { ResultStep } from '../components/funnel/steps/ResultStep'
import { SingleSelectStep } from '../components/funnel/steps/SingleSelectStep'
import { Button } from '../components/ui/Button'
import { FormError } from '../components/ui/FormError'
import { ProgressBar } from '../components/ui/ProgressBar'
import { Select } from '../components/ui/Select'

type PreviewSectionProps = {
  index: string
  title: string
  description: string
  children: ReactNode
}

function PreviewSection({ index, title, description, children }: PreviewSectionProps) {
  return (
    <section className="grid gap-6 border-b border-line py-10 last:border-b-0 sm:py-14 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-16">
      <div>
        <p className="text-xs font-bold tracking-[0.14em] text-accent uppercase">{index}</p>
        <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  )
}

export function UiKitPage() {
  const [goal, setGoal] = useState('invest')
  const [interests, setInterests] = useState(['support'])
  const [amount, setAmount] = useState('500000')
  const [experience, setExperience] = useState('beginner')

  return (
    <div className="min-h-screen bg-canvas font-sans text-ink">
      <header className="bg-accent px-4 text-on-accent sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between border-b border-white/15 py-4">
          <Link className="text-sm font-semibold" to="/">
            Funnel Runtime
          </Link>
          <span className="text-xs font-medium tracking-[0.12em] text-white/65 uppercase">
            UI foundation
          </span>
        </div>
        <div className="mx-auto max-w-6xl py-12 sm:py-16">
          <p className="text-xs font-bold tracking-[0.14em] text-white/60 uppercase">
            Компоненты воронки
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-[-0.045em] sm:text-6xl">
            Спокойный интерфейс для понятных решений
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-white/70 sm:text-lg">
            Все базовые элементы собраны на одной странице. Здесь видно, как они выглядят отдельно и
            внутри реального шага воронки.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        <PreviewSection
          index="01 — Progress"
          title="Прогресс"
          description="Показывает, сколько доступных шагов уже пройдено."
        >
          <div className="rounded-panel border border-line bg-surface p-5 shadow-panel sm:p-7">
            <ProgressBar current={3} total={6} />
          </div>
        </PreviewSection>

        <PreviewSection
          index="02 — Button"
          title="Кнопки"
          description="Основные действия, возврат назад и состояния загрузки или недоступности."
        >
          <div className="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface p-5 shadow-panel sm:p-7">
            <Button type="button">Продолжить</Button>
            <Button type="button" variant="secondary">
              Сохранить
            </Button>
            <Button type="button" variant="ghost">
              Назад
            </Button>
            <Button type="button" disabled>
              Недоступно
            </Button>
            <Button type="button" isLoading>
              Сохранить
            </Button>
          </div>
        </PreviewSection>

        <PreviewSection
          index="03 — Select"
          title="Выпадающий список"
          description="Подходит для компактного выбора одного значения из длинного списка."
        >
          <div className="max-w-xl rounded-panel border border-line bg-surface p-5 shadow-panel sm:p-7">
            <Select
              id="experience"
              label="Опыт инвестирования"
              description="Выберите вариант, который лучше всего вас описывает."
              value={experience}
              onChange={(event) => setExperience(event.target.value)}
            >
              <option value="beginner">Только начинаю</option>
              <option value="some">Есть небольшой опыт</option>
              <option value="advanced">Инвестирую регулярно</option>
            </Select>
          </div>
        </PreviewSection>

        <PreviewSection
          index="04 — Radio"
          title="Один вариант"
          description="Radio-кнопки используются, когда пользователь должен выбрать ровно один ответ."
        >
          <FunnelLayout progress={<ProgressBar current={2} total={6} />}>
            <SingleSelectStep
              name="goal"
              title="Какая у вас основная цель?"
              description="Выберите один наиболее подходящий вариант."
              value={goal}
              onChange={setGoal}
              options={[
                {
                  value: 'credit',
                  label: 'Получить финансирование',
                  description: 'Для крупной покупки или развития проекта'
                },
                {
                  value: 'invest',
                  label: 'Начать инвестировать',
                  description: 'Чтобы постепенно увеличивать капитал'
                },
                {
                  value: 'save',
                  label: 'Создать накопления',
                  description: 'Сформировать финансовую подушку'
                }
              ]}
            />
            <StepActions onBack={() => undefined} />
          </FunnelLayout>
        </PreviewSection>

        <PreviewSection
          index="05 — Checkbox"
          title="Несколько вариантов"
          description="Checkbox позволяет отметить сразу несколько подходящих ответов."
        >
          <FunnelLayout progress={<ProgressBar current={3} total={6} />}>
            <MultiSelectStep
              name="interests"
              title="Что для вас особенно важно?"
              description="Можно выбрать несколько вариантов."
              value={interests}
              onChange={setInterests}
              options={[
                { value: 'speed', label: 'Быстрое оформление' },
                { value: 'support', label: 'Помощь специалиста' },
                { value: 'flexibility', label: 'Гибкие условия' }
              ]}
            />
            <StepActions onBack={() => undefined} />
          </FunnelLayout>
        </PreviewSection>

        <PreviewSection
          index="06 — Number input"
          title="Числовое поле"
          description="Для суммы, возраста или другого ответа, который пользователь вводит числом."
        >
          <FunnelLayout progress={<ProgressBar current={4} total={6} />}>
            <NumberStep
              id="amount"
              title="С какой суммой вы планируете работать?"
              description="Укажите ориентировочную сумму."
              label="Сумма"
              value={amount}
              min={10000}
              max={10000000}
              suffix="₽"
              onChange={setAmount}
            />
            <StepActions onBack={() => undefined} />
          </FunnelLayout>
          <div className="mt-4 rounded-control border border-danger/25 bg-danger/5 px-4 py-3">
            <FormError>Пример ошибки: введите сумму от 10 000 ₽.</FormError>
          </div>
        </PreviewSection>

        <PreviewSection
          index="07 — Complete screens"
          title="Готовые экраны"
          description="Примеры первого информационного и финального экранов воронки."
        >
          <div className="grid gap-5 xl:grid-cols-2">
            <FunnelLayout progress={<ProgressBar current={1} total={6} />}>
              <InfoStep
                title="Подберём подходящее финансовое решение"
                body="Ответьте на несколько вопросов. Это займёт около двух минут."
              />
              <StepActions continueLabel="Начать" />
            </FunnelLayout>
            <FunnelLayout progress={<ProgressBar current={6} total={6} />}>
              <ResultStep
                title="Рекомендация готова"
                body="Мы подготовили подходящий сценарий на основе ваших целей и предпочтений."
                ctaLabel="Посмотреть предложение"
              />
            </FunnelLayout>
          </div>
        </PreviewSection>
      </main>
    </div>
  )
}
