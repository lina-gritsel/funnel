import { randomUUID } from 'node:crypto'

import {
  ClientFunnelEventSchema,
  type ClientFunnelEvent,
  type EventBatchResponse,
  type FunnelAnswer,
  type FunnelSession,
  type FunnelStepConfig,
  type FunnelVariantId
} from '@funnel/contracts'
import { resolveVariant } from '@funnel/engine'

import type { AppDatabase } from './database.js'
import type { FunnelConfigService } from './funnel-config.js'

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
  constructor(
    private readonly database: AppDatabase,
    private readonly configs: FunnelConfigService
  ) {}

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

  recordStepCompleted(input: {
    session: FunnelSession
    step: FunnelStepConfig
    answer?: FunnelAnswer
    nextStepId: string
    clientTimestamp: string
    serverTimestamp: string
  }) {
    const { session, step, answer, nextStepId, clientTimestamp, serverTimestamp } = input

    if (step.type !== 'info' && step.type !== 'result') {
      this.insertForSession(session, {
        name: 'answer_submitted',
        stepId: step.id,
        clientTimestamp,
        serverTimestamp,
        properties: {
          answer_type: step.type,
          ...(Array.isArray(answer) ? { selected_count: answer.length } : {})
        }
      })
    }

    this.insertForSession(session, {
      name: 'step_completed',
      stepId: step.id,
      clientTimestamp,
      serverTimestamp,
      properties: { next_step_id: nextStepId }
    })

    this.configs
      .getVersion(session.version)
      .customEvents.filter(
        (event) => event.trigger === 'step_completed' && event.stepId === step.id
      )
      .forEach((event) =>
        this.insertForSession(session, {
          name: event.name,
          stepId: step.id,
          clientTimestamp,
          serverTimestamp,
          properties: { next_step_id: nextStepId }
        })
      )
  }

  recordBackClicked(input: {
    session: FunnelSession
    fromStepId: string
    toStepId: string
    clientTimestamp: string
    serverTimestamp: string
  }) {
    this.insertForSession(input.session, {
      name: 'back_clicked',
      stepId: input.fromStepId,
      clientTimestamp: input.clientTimestamp,
      serverTimestamp: input.serverTimestamp,
      properties: {
        from_step_id: input.fromStepId,
        to_step_id: input.toStepId
      }
    })
  }

  markStepReached(sessionId: string, stepId: string, reachedAt: string) {
    this.database
      .prepare(
        `INSERT OR IGNORE INTO session_reached_steps (session_id, step_id, reached_at)
         VALUES (?, ?, ?)`
      )
      .run(sessionId, stepId, reachedAt)
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

      if (!this.isAllowedEvent(event, session)) {
        response.rejected.push({
          index,
          eventId: event.eventId,
          message: `Event ${event.name} is not allowed for this funnel version, variant and session route`
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

  private isAllowedEvent(event: ClientFunnelEvent, session: EventSessionRow) {
    const config = this.configs.getVersion(session.funnel_version)
    const funnel = resolveVariant(config, session.variant)
    const step = funnel.steps.find((candidate) => candidate.id === event.stepId)
    if (!step || !this.hasReachedStep(session.id, step.id)) return false

    if (event.name === 'step_viewed') return true
    return step.type === 'result'
  }

  private hasReachedStep(sessionId: string, stepId: string) {
    return Boolean(
      this.database
        .prepare(
          `SELECT 1 FROM session_reached_steps
           WHERE session_id = ? AND step_id = ?`
        )
        .get(sessionId, stepId)
    )
  }

  private insertForSession(
    session: FunnelSession,
    event: {
      name: string
      stepId: string
      clientTimestamp: string
      serverTimestamp: string
      properties: Record<string, string | number | boolean | null>
    }
  ) {
    this.insert({
      eventId: randomUUID(),
      sessionId: session.id,
      name: event.name,
      clientTimestamp: event.clientTimestamp,
      serverTimestamp: event.serverTimestamp,
      funnelId: session.funnelId,
      version: session.version,
      variant: session.variant,
      stepId: event.stepId,
      utm: session.utm,
      properties: event.properties
    })
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
