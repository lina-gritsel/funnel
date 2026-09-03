import {
  FunnelConfigSchema,
  FunnelConfigPreviewResponseSchema,
  FunnelVersionsResponseSchema,
  type FunnelConfig,
  type FunnelConfigPreviewResponse,
  type FunnelVersionsResponse
} from '@funnel/contracts'

async function errorMessage(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as { message?: unknown } | null
  return typeof body?.message === 'string' ? body.message : fallback
}

export async function fetchActiveFunnel({
  signal
}: {
  signal: AbortSignal
}): Promise<FunnelConfig> {
  const response = await fetch('/api/funnels/active', { signal })

  if (!response.ok) {
    throw new Error('Active funnel config request failed')
  }

  return FunnelConfigSchema.parse(await response.json())
}

export async function fetchFunnelVersions({
  signal
}: {
  signal: AbortSignal
}): Promise<FunnelVersionsResponse> {
  const response = await fetch('/api/funnels/versions', { signal })
  if (!response.ok) throw new Error('Funnel versions request failed')
  return FunnelVersionsResponseSchema.parse(await response.json())
}

export async function createFunnelVersion(config: unknown): Promise<FunnelConfig> {
  const response = await fetch('/api/funnels/versions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ config })
  })
  if (!response.ok) throw new Error(await errorMessage(response, 'Не удалось загрузить версию'))
  return FunnelConfigSchema.parse(await response.json())
}

export async function validateFunnelConfig(config: unknown): Promise<FunnelConfigPreviewResponse> {
  const response = await fetch('/api/funnels/validate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ config })
  })
  if (!response.ok) throw new Error(await errorMessage(response, 'Конфигурация не прошла проверку'))
  return FunnelConfigPreviewResponseSchema.parse(await response.json())
}

export async function publishFunnelVersion(version: number): Promise<FunnelConfig> {
  const response = await fetch(`/api/funnels/versions/${version}/publish`, { method: 'POST' })
  if (!response.ok) throw new Error(await errorMessage(response, 'Не удалось опубликовать версию'))
  return FunnelConfigSchema.parse(await response.json())
}

export async function rollbackFunnelVersion(): Promise<FunnelConfig> {
  const response = await fetch('/api/funnels/rollback', { method: 'POST' })
  if (!response.ok) throw new Error(await errorMessage(response, 'Не удалось выполнить откат'))
  return FunnelConfigSchema.parse(await response.json())
}
