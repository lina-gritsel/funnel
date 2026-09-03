import {
  SessionBootstrapResponseSchema,
  SessionStateResponseSchema,
  type FunnelVariantId,
  type SessionBootstrapResponse,
  type SessionStateResponse,
  type SubmitAnswerRequest
} from '@funnel/contracts'

type BootstrapSessionInput = {
  variant?: FunnelVariantId
  utm: Record<string, string>
  signal: AbortSignal
}

export type SessionBootstrapResult = SessionBootstrapResponse & {
  viewReason: 'initial' | 'refresh'
}

function storageKey(variant?: FunnelVariantId) {
  return `funnel-session:${variant ?? 'assigned'}`
}

async function errorMessage(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as { message?: unknown } | null
  return typeof body?.message === 'string' ? body.message : fallback
}

export async function bootstrapSession({
  variant,
  utm,
  signal
}: BootstrapSessionInput): Promise<SessionBootstrapResult> {
  const key = storageKey(variant)
  const savedId = window.localStorage.getItem(key)

  if (savedId) {
    const response = await fetch(`/api/sessions/${savedId}`, { signal })
    if (response.ok) {
      return {
        ...SessionBootstrapResponseSchema.parse(await response.json()),
        viewReason: 'refresh'
      }
    }

    if (response.status !== 404) {
      throw new Error(await errorMessage(response, 'Не удалось восстановить сессию'))
    }
    window.localStorage.removeItem(key)
  }

  const response = await fetch('/api/sessions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ...(variant ? { variant } : {}),
      utm,
      clientTimestamp: new Date().toISOString()
    }),
    signal
  })
  if (!response.ok) throw new Error(await errorMessage(response, 'Не удалось создать сессию'))

  const data = SessionBootstrapResponseSchema.parse(await response.json())
  window.localStorage.setItem(key, data.session.id)
  return { ...data, viewReason: 'initial' }
}

export async function submitSessionAnswer(
  sessionId: string,
  input: SubmitAnswerRequest
): Promise<SessionStateResponse> {
  const response = await fetch(`/api/sessions/${sessionId}/answers`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...input, clientTimestamp: new Date().toISOString() })
  })
  if (!response.ok) throw new Error(await errorMessage(response, 'Не удалось сохранить ответ'))
  return SessionStateResponseSchema.parse(await response.json())
}

export async function moveSessionBack(sessionId: string): Promise<SessionStateResponse> {
  const response = await fetch(`/api/sessions/${sessionId}/back`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clientTimestamp: new Date().toISOString() })
  })
  if (!response.ok) throw new Error(await errorMessage(response, 'Не удалось вернуться назад'))
  return SessionStateResponseSchema.parse(await response.json())
}
