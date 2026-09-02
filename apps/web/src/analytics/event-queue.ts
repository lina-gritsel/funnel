import {
  ClientFunnelEventSchema,
  EventBatchResponseSchema,
  type ClientFunnelEvent,
  type FunnelEventProperties
} from '@funnel/contracts'

const storageKey = 'funnel-event-outbox'
const batchSize = 50
let flushTimer: ReturnType<typeof setTimeout> | undefined
let isFlushing = false

type TrackEventInput = Omit<ClientFunnelEvent, 'eventId' | 'clientTimestamp' | 'properties'> & {
  clientTimestamp?: string
  properties?: FunnelEventProperties
}

function readOutbox(): ClientFunnelEvent[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(storageKey) ?? '[]') as unknown
    if (!Array.isArray(value)) return []
    return value.flatMap((event) => {
      const parsed = ClientFunnelEventSchema.safeParse(event)
      return parsed.success ? [parsed.data] : []
    })
  } catch {
    return []
  }
}

function writeOutbox(events: ClientFunnelEvent[]) {
  window.localStorage.setItem(storageKey, JSON.stringify(events))
}

function scheduleFlush(delay = 1000) {
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = undefined
    void flushEvents()
  }, delay)
}

export function trackEvent(input: TrackEventInput) {
  try {
    const event = ClientFunnelEventSchema.parse({
      ...input,
      eventId: crypto.randomUUID(),
      clientTimestamp: input.clientTimestamp ?? new Date().toISOString(),
      properties: input.properties ?? {}
    })
    writeOutbox([...readOutbox(), event])
    scheduleFlush()
    return event.eventId
  } catch {
    return null
  }
}

export async function flushEvents() {
  if (isFlushing) return
  const batch = readOutbox().slice(0, batchSize)
  if (batch.length === 0) return

  isFlushing = true
  try {
    const response = await fetch('/api/events/batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ events: batch })
    })
    if (!response.ok) return

    const result = EventBatchResponseSchema.parse(await response.json())
    const handled = new Set([...result.accepted, ...result.duplicates])
    result.rejected.forEach((rejection) => {
      const eventId = rejection.eventId ?? batch[rejection.index]?.eventId
      if (eventId) handled.add(eventId)
    })
    writeOutbox(readOutbox().filter((event) => !handled.has(event.eventId)))
  } catch {
    return
  } finally {
    isFlushing = false
    if (readOutbox().length > 0) scheduleFlush(1500)
  }
}

function flushWithBeacon() {
  const batch = readOutbox().slice(0, batchSize)
  if (batch.length === 0) return

  try {
    navigator.sendBeacon(
      '/api/events/batch',
      new Blob([JSON.stringify({ events: batch })], { type: 'application/json' })
    )
  } catch {
    return
  }
}

export function startEventDelivery() {
  const onPageHide = () => flushWithBeacon()
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') flushWithBeacon()
  }

  window.addEventListener('pagehide', onPageHide)
  document.addEventListener('visibilitychange', onVisibilityChange)
  scheduleFlush(0)

  return () => {
    window.removeEventListener('pagehide', onPageHide)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    if (flushTimer) clearTimeout(flushTimer)
    flushTimer = undefined
  }
}
