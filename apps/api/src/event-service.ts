import { randomUUID } from 'node:crypto'

import {
  ClientFunnelEventSchema,
  type ClientFunnelEvent,
  type EventBatchResponse,
  type FunnelSession,
  type FunnelVariantId
} from '@funnel/contracts'

import type { AppDatabase } from './database.js'

type EventSessionRow = {
  id: string
  funnel_id: string
  funnel_version: number
  variant: FunnelVariantId
  utm_json: string
}

function rawEventId(value: unknown) {
  if (!value || typeof value !== 'object') return undefined
  const eventId = Reflect.get(value, 'eventId')
  return typeof eventId === 'string' ? eventId : undefined
}

function containsRawAnswer(event: ClientFunnelEvent) {
  return Object.keys(event.properties).some((key) =>
    ['answer', 'answers', 'raw_answer', 'rawAnswer', 'value'].includes(key)
  )
}

export class EventService {
  constructor(private readonly database: AppDatabase) {}

  recordSessionStarted(session: FunnelSession, clientTimestamp?: string) {
    this.insert({
      eventId: randomUUID(),
      sessionId: session.id,
      name: 'session_started',
      clientTimestamp: clientTimestamp ?? session.createdAt,
      serverTimestamp: session.createdAt,
      funnelId: session.funnelId,
      version: session.version,
      variant: session.variant,
      stepId: session.currentStepId,
      utm: session.utm,
      properties: { entry_step_id: session.currentStepId }
    })
  }

  ingest(events: unknown[]): EventBatchResponse {
    const response: EventBatchResponse = { accepted: [], duplicates: [], rejected: [] }

    events.forEach((value, index) => {
      const parsed = ClientFunnelEventSchema.safeParse(value)
      if (!parsed.success) {
        response.rejected.push({
          index,
          ...(rawEventId(value) ? { eventId: rawEventId(value) } : {}),
          message: parsed.error.issues[0]?.message ?? 'Invalid event'
        })
        return
      }

      const event = parsed.data
      if (containsRawAnswer(event)) {
        response.rejected.push({
          index,
          eventId: event.eventId,
          message: 'Raw answers are not accepted in analytics events'
        })
        return
      }

      if (this.hasEvent(event.eventId)) {
        response.duplicates.push(event.eventId)
        return
      }

      const session = this.getSession(event.sessionId)
      if (!session) {
        response.rejected.push({
          index,
          eventId: event.eventId,
          message: 'Session not found'
        })
        return
      }

      try {
        this.insert({
          eventId: event.eventId,
          sessionId: event.sessionId,
          name: event.name,
          clientTimestamp: event.clientTimestamp,
          serverTimestamp: new Date().toISOString(),
          funnelId: session.funnel_id,
          version: session.funnel_version,
          variant: session.variant,
          stepId: event.stepId,
          utm: JSON.parse(session.utm_json) as Record<string, string>,
          properties: event.properties
        })
        response.accepted.push(event.eventId)
      } catch {
        response.rejected.push({
          index,
          eventId: event.eventId,
          message: 'Event could not be stored'
        })
      }
    })

    return response
  }

  private hasEvent(eventId: string) {
    return Boolean(this.database.prepare('SELECT 1 FROM events WHERE event_id = ?').get(eventId))
  }

  private getSession(sessionId: string) {
    return this.database
      .prepare(
        `SELECT id, funnel_id, funnel_version, variant, utm_json
         FROM sessions WHERE id = ?`
      )
      .get(sessionId) as EventSessionRow | undefined
  }

  private insert(event: {
    eventId: string
    sessionId: string
    name: string
    clientTimestamp: string
    serverTimestamp: string
    funnelId: string
    version: number
    variant: FunnelVariantId
    stepId: string
    utm: Record<string, string>
    properties: Record<string, string | number | boolean | null>
  }) {
    this.database
      .prepare(
        `INSERT INTO events (
          event_id, session_id, event_name, client_timestamp, server_timestamp,
          funnel_id, funnel_version, variant, step_id, utm_json, utm_campaign, properties_json
        ) VALUES (
          @eventId, @sessionId, @name, @clientTimestamp, @serverTimestamp,
          @funnelId, @version, @variant, @stepId, @utm, @utmCampaign, @properties
        )`
      )
      .run({
        ...event,
        utm: JSON.stringify(event.utm),
        utmCampaign: event.utm.utm_campaign ?? null,
        properties: JSON.stringify(event.properties)
      })
  }
}
