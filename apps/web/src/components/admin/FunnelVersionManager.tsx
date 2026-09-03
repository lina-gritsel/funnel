import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { FunnelConfig, FunnelVersionsResponse } from '@funnel/contracts'
import { useEffect, useRef, useState } from 'react'

import {
  createFunnelVersion,
  publishFunnelVersion,
  rollbackFunnelVersion,
  validateFunnelConfig
} from '../../api/funnel'
import { Button } from '../ui/Button'

const statusLabel = { active: 'На сайте', draft: 'Не опубликована', archived: 'В архиве' } as const

export function FunnelVersionManager({
  data,
  config
}: {
  data: FunnelVersionsResponse
  config: FunnelConfig
}) {
  const queryClient = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)
  const confirmationPanel = useRef<HTMLDivElement>(null)
  const [source, setSource] = useState('')
  const [fileName, setFileName] = useState('')
  const [reading, setReading] = useState(false)
  const [localError, setLocalError] = useState('')
  const [notice, setNotice] = useState('')
  const [confirmation, setConfirmation] = useState<{
    type: 'publish' | 'rollback'
    version: number
  } | null>(null)
  useEffect(() => {
    if (confirmation) confirmationPanel.current?.focus()
  }, [confirmation])
  const nextVersion = Math.max(...data.versions.map((version) => version.version)) + 1
  const rollbackTarget = data.versions
    .filter(
      (version) =>
        version.version < data.activeVersion &&
        version.status === 'archived' &&
        version.publishedAt !== null
    )
    .sort((a, b) => b.version - a.version)[0]

  const parsedSource = () => {
    let value: unknown
    try {
      value = JSON.parse(source)
    } catch {
      throw new Error(
        'Не удалось прочитать JSON. Проверьте формат файла или попросите разработчика исправить его.'
      )
    }
    if (!value || typeof value !== 'object' || !('id' in value) || value.id !== config.id)
      throw new Error(`Этот файл должен относиться к текущей воронке: поле id — «${config.id}».`)
    if (!('version' in value) || value.version !== nextVersion)
      throw new Error(
        `Следующая версия — v${nextVersion}. Укажите ${nextVersion} в поле version или скачайте подготовленный шаблон.`
      )
    return value
  }
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['active-funnel'] }),
      queryClient.invalidateQueries({ queryKey: ['funnel-versions'] }),
      queryClient.invalidateQueries({ queryKey: ['analytics'] })
    ])
  }
  const validateMutation = useMutation({ mutationFn: () => validateFunnelConfig(parsedSource()) })
  const createMutation = useMutation({
    mutationFn: async () => {
      const value = parsedSource()
      await validateFunnelConfig(value)
      return createFunnelVersion(value)
    },
    onSuccess: async (draft) => {
      setSource('')
      setFileName('')
      if (fileInput.current) fileInput.current.value = ''
      validateMutation.reset()
      setNotice(
        `Черновик v${draft.version} сохранён. На сайте пока ничего не изменилось. Опубликуйте его в разделе «Версии воронки» ниже.`
      )
      await refresh()
    }
  })
  const publishMutation = useMutation({
    mutationFn: publishFunnelVersion,
    onSuccess: async (published) => {
      setConfirmation(null)
      setNotice(
        `Версия v${published.version} опубликована. Новые посетители увидят её, а начавшие раньше продолжат свою версию.`
      )
      await refresh()
    }
  })
  const rollbackMutation = useMutation({
    mutationFn: rollbackFunnelVersion,
    onSuccess: async (published) => {
      setConfirmation(null)
      setNotice(
        `На сайт возвращена версия v${published.version}. Ответы и история прохождений сохранены.`
      )
      await refresh()
    }
  })
  const busy =
    reading ||
    validateMutation.isPending ||
    createMutation.isPending ||
    publishMutation.isPending ||
    rollbackMutation.isPending
  const uploadError = localError || createMutation.error?.message || validateMutation.error?.message
  const publishError = publishMutation.error?.message || rollbackMutation.error?.message

  function downloadTemplate() {
    const template = { ...config, version: nextVersion, status: 'draft' }
    delete template.publishedAt
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' })
    )
    const link = document.createElement('a')
    link.href = url
    link.download = `funnel-v${nextVersion}.json`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <section
      className="border-b border-line py-10 sm:py-12"
      aria-labelledby="version-manager-title"
    >
      <div className="max-w-2xl">
        <h2 id="version-manager-title" className="text-2xl font-semibold tracking-[-0.03em]">
          Как изменить воронку
        </h2>
        <p className="mt-3 text-sm leading-6 text-muted">
          Конфигурация — это файл с текстами, вопросами и переходами между экранами. Здесь вы
          загружаете готовый файл, проверяете его и решаете, когда показать изменения посетителям.
        </p>
      </div>
      <form
        className="mt-8"
        onSubmit={(event) => {
          event.preventDefault()
          if (!busy && validateMutation.data) createMutation.mutate()
        }}
      >
        <ol className="grid gap-8 lg:grid-cols-3 lg:gap-10">
          <li className="min-w-0 border-t border-line pt-5">
            <p className="text-xs font-bold tracking-widest text-accent">ШАГ 1</p>
            <h3 className="mt-2 text-lg font-semibold">Выберите файл изменений</h3>
            <p className="mt-2 text-sm leading-6 text-muted">
              Нужен файл .json от разработчика. Нет файла? Скачайте текущую конфигурацию как шаблон
              для новой версии.
            </p>
            <button
              type="button"
              className="mt-3 text-sm font-semibold text-accent underline underline-offset-4 focus-visible:outline-2"
              onClick={downloadTemplate}
            >
              Скачать шаблон v{nextVersion}
            </button>
            <div className="mt-5">
              <input
                ref={fileInput}
                id="funnel-config-file"
                type="file"
                accept="application/json,.json"
                aria-label="Новая конфигурация"
                aria-describedby="file-help"
                className="peer sr-only"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (!file) return
                  setSource('')
                  setFileName(file.name)
                  setLocalError('')
                  setNotice('')
                  setReading(true)
                  validateMutation.reset()
                  createMutation.reset()
                  void file
                    .text()
                    .then(setSource)
                    .catch(() =>
                      setLocalError('Файл не удалось открыть. Попробуйте выбрать его ещё раз.')
                    )
                    .finally(() => setReading(false))
                }}
              />
              <label
                htmlFor="funnel-config-file"
                className={`inline-flex min-h-12 items-center rounded-control border border-line bg-surface px-5 text-sm font-semibold transition-colors hover:bg-accent-soft peer-focus-visible:ring-2 peer-focus-visible:ring-accent ${busy ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}
              >
                {fileName ? 'Выбрать другой файл' : 'Выбрать JSON-файл'}
              </label>
              <p id="file-help" className="mt-3 break-all text-xs leading-5 text-muted">
                {reading
                  ? 'Читаем файл…'
                  : fileName || 'Файл пока не выбран. Сайт продолжает работать без изменений.'}
              </p>
            </div>
          </li>
          <li className="min-w-0 border-t border-line pt-5">
            <p className="text-xs font-bold tracking-widest text-accent">ШАГ 2</p>
            <h3 className="mt-2 text-lg font-semibold">Проверьте перед сохранением</h3>
            <p className="mt-2 text-sm leading-6 text-muted">
              Проверим структуру файла и переходы в обоих вариантах A/B: маршрут не должен
              зацикливаться или обрываться до результата.
            </p>
            <Button
              className="mt-5"
              type="button"
              variant="secondary"
              disabled={!source || busy}
              isLoading={validateMutation.isPending}
              onClick={() => {
                setLocalError('')
                createMutation.reset()
                validateMutation.mutate()
              }}
            >
              Проверить конфигурацию
            </Button>
            <p className="mt-3 text-xs leading-5 text-muted">
              Проверка не публикует изменения и не заменяет проверку текстов и дизайна человеком.
            </p>
          </li>
          <li className="min-w-0 border-t border-line pt-5">
            <p className="text-xs font-bold tracking-widest text-accent">ШАГ 3</p>
            <h3 className="mt-2 text-lg font-semibold">Сохраните для публикации</h3>
            <p className="mt-2 text-sm leading-6 text-muted">
              Черновик — это сохранённая, но ещё не запущенная версия. Он появится в списке ниже.
              Публикация — отдельное действие.
            </p>
            <Button
              className="mt-5"
              type="submit"
              disabled={!validateMutation.data || busy}
              isLoading={createMutation.isPending}
            >
              Сохранить черновик
            </Button>
            <p className="mt-3 text-xs leading-5 text-muted">
              {validateMutation.data
                ? 'Файл проверен. Теперь его можно сохранить.'
                : 'Кнопка станет доступна после успешной проверки файла.'}
            </p>
          </li>
        </ol>
        {validateMutation.data ? (
          <div role="status" className="mt-6 border-l-2 border-success pl-4 text-sm leading-6">
            <p className="font-semibold text-success">
              Проверка пройдена: версия v{validateMutation.data.version} готова к сохранению.
            </p>
            <p className="text-muted">
              Вариант A: {validateMutation.data.variants.A.reachableSteps} экранов,{' '}
              {validateMutation.data.variants.A.routes} маршрутов. Вариант B:{' '}
              {validateMutation.data.variants.B.reachableSteps} экранов,{' '}
              {validateMutation.data.variants.B.routes} маршрутов.
            </p>
          </div>
        ) : null}
        {uploadError ? (
          <div role="alert" className="mt-6 border-l-2 border-danger pl-4 text-sm leading-6">
            <p className="font-semibold text-danger">Не удалось подготовить файл</p>
            <p className="text-muted">
              На сайте ничего не изменилось. Исправьте файл и проверьте его ещё раз.
            </p>
            <p className="mt-2 break-words text-danger">{uploadError}</p>
          </div>
        ) : null}
        <details className="mt-6 text-sm text-muted">
          <summary className="w-fit cursor-pointer font-medium hover:text-ink">
            Что передать разработчику?
          </summary>
          <p className="mt-3 max-w-2xl leading-6">
            Используйте шаблон выше. Сохраните идентификатор воронки{' '}
            <code className="break-all text-ink">{config.id}</code> и номер новой версии{' '}
            <strong className="text-ink">{nextVersion}</strong>. Измените нужные тексты, вопросы или
            переходы и верните файл в формате JSON. Эта страница не редактирует содержимое файла.
          </p>
        </details>
      </form>

      <div className="mt-12" aria-labelledby="version-history-title">
        <h2 id="version-history-title" className="text-2xl font-semibold tracking-[-0.03em]">
          Версии воронки
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          «На сайте» — версия для новых посетителей. Черновики видны только здесь. Архив хранит
          прошлые версии: начатые прохождения и их аналитика не теряются.
        </p>
        {notice ? (
          <p
            role="status"
            className="mt-5 border-l-2 border-success pl-4 text-sm leading-6 text-success"
          >
            {notice}
          </p>
        ) : null}
        <ul className="mt-5 divide-y divide-line border-y border-line">
          {data.versions.map((version) => (
            <li
              key={version.version}
              className="grid gap-3 py-5 sm:grid-cols-[100px_minmax(0,1fr)_auto] sm:items-center"
            >
              <strong className="text-lg">Версия {version.version}</strong>
              <div>
                <p
                  className={`text-sm font-semibold ${version.status === 'active' ? 'text-accent' : ''}`}
                >
                  {statusLabel[version.status]}
                </p>
                <p className="mt-1 text-xs leading-5 text-muted">
                  {version.status === 'draft'
                    ? 'Черновик. Посетители пока не видят эти изменения.'
                    : version.status === 'active'
                      ? 'Используется для новых прохождений.'
                      : 'Сохранена для истории и ранее начатых прохождений.'}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {version.publishedAt
                    ? `Опубликована ${version.publishedAt.slice(0, 10)}`
                    : `Создана ${version.createdAt.slice(0, 10)}`}
                </p>
              </div>
              {version.status === 'draft' ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    publishMutation.reset()
                    rollbackMutation.reset()
                    setConfirmation({ type: 'publish', version: version.version })
                  }}
                >
                  Опубликовать v{version.version}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="max-w-xl">
            <h3 className="font-semibold">Вернуть предыдущую версию</h3>
            <p className="mt-2 text-sm leading-6 text-muted">
              {rollbackTarget
                ? `Можно вернуться к v${rollbackTarget.version}. Переключатся только новые посетители; ответы и начатые прохождения сохранятся.`
                : 'Откат пока недоступен: нет более ранней опубликованной версии. Он появится после публикации следующей версии.'}
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={!rollbackTarget || busy}
            onClick={() => {
              if (!rollbackTarget) return
              publishMutation.reset()
              rollbackMutation.reset()
              setConfirmation({ type: 'rollback', version: rollbackTarget.version })
            }}
          >
            Откатить версию
          </Button>
        </div>
        {confirmation ? (
          <div
            ref={confirmationPanel}
            tabIndex={-1}
            role="region"
            aria-label="Подтверждение изменения версии"
            className="mt-6 rounded-control border border-accent/30 bg-accent-soft p-5"
          >
            <h3 className="font-semibold">
              {confirmation.type === 'publish'
                ? `Опубликовать версию v${confirmation.version}?`
                : `Вернуть на сайт версию v${confirmation.version}?`}
            </h3>
            <p className="mt-2 text-sm leading-6 text-muted">
              Это изменит публичную воронку для новых посетителей. Те, кто уже начал прохождение,
              останутся на своей версии.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                type="button"
                disabled={busy}
                isLoading={publishMutation.isPending || rollbackMutation.isPending}
                onClick={() => {
                  setNotice('')
                  if (confirmation.type === 'publish') publishMutation.mutate(confirmation.version)
                  else rollbackMutation.mutate()
                }}
              >
                Подтвердить {confirmation.type === 'publish' ? 'публикацию' : 'откат'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => setConfirmation(null)}
              >
                Отмена
              </Button>
            </div>
          </div>
        ) : null}
        {publishError ? (
          <p role="alert" className="mt-4 text-sm text-danger">
            Не удалось изменить активную версию. Обновите страницу и проверьте её статус.{' '}
            {publishError}
          </p>
        ) : null}
      </div>
    </section>
  )
}
