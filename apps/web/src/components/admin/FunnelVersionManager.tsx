import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { FunnelVersionsResponse } from '@funnel/contracts'
import { useState } from 'react'

import {
  createFunnelVersion,
  publishFunnelVersion,
  rollbackFunnelVersion,
  validateFunnelConfig
} from '../../api/funnel'
import { Button } from '../ui/Button'

const statusLabel = {
  active: 'Активна',
  draft: 'Черновик',
  archived: 'Архив'
} as const

export function FunnelVersionManager({ data }: { data: FunnelVersionsResponse }) {
  const queryClient = useQueryClient()
  const [source, setSource] = useState('')
  const [fileName, setFileName] = useState('')
  const [localError, setLocalError] = useState('')

  const parsedSource = () => {
    setLocalError('')
    try {
      return JSON.parse(source) as unknown
    } catch {
      throw new Error('Файл содержит некорректный JSON')
    }
  }

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['active-funnel'] }),
      queryClient.invalidateQueries({ queryKey: ['funnel-versions'] }),
      queryClient.invalidateQueries({ queryKey: ['analytics'] })
    ])
  }

  const validateMutation = useMutation({
    mutationFn: () => validateFunnelConfig(parsedSource())
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      const config = parsedSource()
      await validateFunnelConfig(config)
      return createFunnelVersion(config)
    },
    onSuccess: async () => {
      setSource('')
      setFileName('')
      validateMutation.reset()
      await refresh()
    }
  })

  const publishMutation = useMutation({
    mutationFn: publishFunnelVersion,
    onSuccess: refresh
  })

  const rollbackMutation = useMutation({
    mutationFn: rollbackFunnelVersion,
    onSuccess: refresh
  })

  const mutationError =
    createMutation.error?.message ??
    validateMutation.error?.message ??
    publishMutation.error?.message ??
    rollbackMutation.error?.message ??
    localError
  const canRollback = data.versions.some(
    (version) =>
      version.version < data.activeVersion &&
      version.status === 'archived' &&
      version.publishedAt !== null
  )

  return (
    <section className="grid gap-8 border-b border-line py-10 sm:py-12 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-16">
      <div>
        <p className="text-xs font-bold tracking-[0.12em] text-accent uppercase">Версии</p>
        <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">Публикация и откат</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Новый JSON сначала сохраняется как черновик и не влияет на текущие сессии.
        </p>
      </div>

      <div className="space-y-8">
        <form
          className="rounded-panel border border-line bg-surface p-5 shadow-panel sm:p-6"
          onSubmit={(event) => {
            event.preventDefault()
            if (!source) {
              setLocalError('Сначала выберите JSON-файл')
              return
            }
            createMutation.mutate()
          }}
        >
          <label className="block text-sm font-semibold" htmlFor="funnel-config-file">
            Новая конфигурация
          </label>
          <p className="mt-1 text-sm leading-6 text-muted">
            Версия должна быть следующей по порядку и использовать тот же funnel ID.
          </p>
          <input
            id="funnel-config-file"
            type="file"
            accept="application/json,.json"
            className="mt-5 block w-full text-sm text-muted file:mr-4 file:rounded-control file:border-0 file:bg-accent-soft file:px-4 file:py-3 file:font-semibold file:text-accent hover:file:bg-accent/10"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (!file) return
              setFileName(file.name)
              setLocalError('')
              validateMutation.reset()
              void file
                .text()
                .then(setSource)
                .catch(() => setLocalError('Не удалось прочитать файл'))
            }}
          />
          <div className="mt-5 flex flex-wrap items-center gap-4">
            <Button
              type="button"
              variant="secondary"
              isLoading={validateMutation.isPending}
              onClick={() => {
                if (!source) {
                  setLocalError('Сначала выберите JSON-файл')
                  return
                }
                validateMutation.mutate()
              }}
            >
              Проверить конфигурацию
            </Button>
            <Button
              type="submit"
              isLoading={createMutation.isPending}
              disabled={validateMutation.isPending}
            >
              Сохранить черновик
            </Button>
            {fileName ? <span className="text-sm text-muted">{fileName}</span> : null}
          </div>
          {validateMutation.data ? (
            <p className="mt-4 border-l-2 border-success pl-3 text-sm text-success">
              Проверка пройдена: A — {validateMutation.data.variants.A.reachableSteps} шагов /{' '}
              {validateMutation.data.variants.A.routes} маршрутов; B —{' '}
              {validateMutation.data.variants.B.reachableSteps} шагов /{' '}
              {validateMutation.data.variants.B.routes} маршрутов.
            </p>
          ) : null}
          {mutationError ? (
            <p className="mt-4 border-l-2 border-danger pl-3 text-sm text-danger">
              {mutationError}
            </p>
          ) : null}
        </form>

        <div className="divide-y divide-line border-y border-line">
          {data.versions.map((version) => (
            <div
              key={version.version}
              className="grid gap-4 py-5 sm:grid-cols-[80px_minmax(0,1fr)_auto] sm:items-center"
            >
              <strong className="text-lg">v{version.version}</strong>
              <div>
                <p className="text-sm font-semibold">{statusLabel[version.status]}</p>
                <p className="mt-1 text-xs text-muted">
                  {version.publishedAt
                    ? `Опубликована ${version.publishedAt.slice(0, 10)}`
                    : `Создана ${version.createdAt.slice(0, 10)}`}
                </p>
              </div>
              {version.status === 'draft' ? (
                <Button
                  variant="secondary"
                  isLoading={
                    publishMutation.isPending && publishMutation.variables === version.version
                  }
                  onClick={() => publishMutation.mutate(version.version)}
                >
                  Опубликовать
                </Button>
              ) : null}
            </div>
          ))}
        </div>

        <div className="flex flex-col items-start gap-2 border-l-2 border-line pl-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-xl text-sm leading-6 text-muted">
            Откат переключит только новые сессии. Уже начатые продолжат свою закреплённую версию.
          </p>
          <Button
            variant="secondary"
            disabled={!canRollback}
            isLoading={rollbackMutation.isPending}
            onClick={() => rollbackMutation.mutate()}
          >
            Откатить версию
          </Button>
        </div>
      </div>
    </section>
  )
}
