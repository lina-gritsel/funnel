import { randomUUID } from 'node:crypto'

import {
  AnalyticsResponseSchema,
  EventBatchResponseSchema,
  SessionBootstrapResponseSchema
} from '@funnel/contracts'
import { afterEach, describe, expect, it } from 'vitest'

import { buildApp } from './app.js'

const apps: ReturnType<typeof buildApp>[] = []

function createApp() {
  const app = buildApp({ databasePath: ':memory:', random: () => 0.1 })
  apps.push(app)
  return app
}

async function createSession(
  app: ReturnType<typeof buildApp>,
  variant: 'A' | 'B' = 'A',
  campaign = 'alpha'
) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/sessions',
    payload: { variant, utm: { utm_campaign: campaign } }
  })
  return SessionBootstrapResponseSchema.parse(response.json()).session
}

async function reachResult(app: ReturnType<typeof buildApp>, sessionId: string) {
  for (const payload of [
    { stepId: 'welcome' },
    { stepId: 'goal', answer: 'invest' },
    { stepId: 'amount', answer: 500000 },
    { stepId: 'priorities', answer: ['support'] },
    { stepId: 'experience', answer: 'experienced' }
  ]) {
    await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/answers`,
      payload
    })
  }
}

function event(sessionId: string, name: string, stepId: string) {
  return {
    eventId: randomUUID(),
    sessionId,
    name,
    clientTimestamp: new Date().toISOString(),
    stepId,
    properties: {}
  }
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

describe('event ingestion', () => {
  it('accepts valid events without letting an invalid item break the batch', async () => {
    const app = createApp()
    const session = await createSession(app)
    const valid = event(session.id, 'step_viewed', 'welcome')
    const response = await app.inject({
      method: 'POST',
      url: '/api/events/batch',
      payload: { events: [valid, { eventId: 'broken' }] }
    })
    const result = EventBatchResponseSchema.parse(response.json())

    expect(result.accepted).toEqual([valid.eventId])
    expect(result.rejected).toHaveLength(1)
  })

  it('deduplicates retries by event id', async () => {
    const app = createApp()
    const session = await createSession(app)
    const viewed = event(session.id, 'step_viewed', 'welcome')

    await app.inject({ method: 'POST', url: '/api/events/batch', payload: { events: [viewed] } })
    const retry = EventBatchResponseSchema.parse(
      (
        await app.inject({
          method: 'POST',
          url: '/api/events/batch',
          payload: { events: [viewed] }
        })
      ).json()
    )

    expect(retry.duplicates).toEqual([viewed.eventId])
  })

  it('rejects raw answers from analytics properties', async () => {
    const app = createApp()
    const session = await createSession(app)
    const submitted = {
      ...event(session.id, 'step_viewed', 'welcome'),
      properties: { answer: 'invest' }
    }
    const result = EventBatchResponseSchema.parse(
      (
        await app.inject({
          method: 'POST',
          url: '/api/events/batch',
          payload: { events: [submitted] }
        })
      ).json()
    )

    expect(result.rejected[0]?.message).toContain('Raw answers')
  })

  it('rejects server-authored events submitted by a client', async () => {
    const app = createApp()
    const session = await createSession(app)
    const custom = event(session.id, 'investment_horizon_selected', 'horizon')
    const result = EventBatchResponseSchema.parse(
      (
        await app.inject({
          method: 'POST',
          url: '/api/events/batch',
          payload: { events: [custom] }
        })
      ).json()
    )

    expect(result.accepted).toEqual([])
    expect(result.rejected).toHaveLength(1)
  })

  it('rejects forged result events and unknown steps', async () => {
    const app = createApp()
    const session = await createSession(app)
    const forgedResult = event(session.id, 'result_viewed', 'result')
    const unknownStep = event(session.id, 'step_viewed', 'not-a-real-step')
    const result = EventBatchResponseSchema.parse(
      (
        await app.inject({
          method: 'POST',
          url: '/api/events/batch',
          payload: { events: [forgedResult, unknownStep] }
        })
      ).json()
    )

    expect(result.accepted).toEqual([])
    expect(result.rejected).toHaveLength(2)

    const analytics = AnalyticsResponseSchema.parse(
      (await app.inject({ method: 'GET', url: '/api/analytics' })).json()
    )
    expect(analytics.totals.resultReached).toBe(0)
  })
})

describe('analytics', () => {
  it('counts unique sessions and filters by UTM campaign', async () => {
    const app = createApp()
    const sessionA = await createSession(app, 'A', 'alpha')
    const sessionB = await createSession(app, 'B', 'beta')
    await reachResult(app, sessionA.id)
    const events = [
      event(sessionA.id, 'result_viewed', 'result'),
      event(sessionA.id, 'cta_clicked', 'result'),
      event(sessionA.id, 'step_viewed', 'result'),
      event(sessionA.id, 'step_viewed', 'result'),
      event(sessionB.id, 'step_viewed', 'welcome'),
      event(sessionB.id, 'step_viewed', 'welcome')
    ]

    await app.inject({ method: 'POST', url: '/api/events/batch', payload: { events } })
    const all = AnalyticsResponseSchema.parse(
      (await app.inject({ method: 'GET', url: '/api/analytics' })).json()
    )
    const alpha = AnalyticsResponseSchema.parse(
      (await app.inject({ method: 'GET', url: '/api/analytics?utmCampaign=alpha' })).json()
    )

    expect(all.totals).toMatchObject({
      sessionsStarted: 2,
      resultReached: 1,
      ctaClicked: 1,
      resultRate: 50
    })
    expect(all.variants.find((variant) => variant.variant === 'A')?.resultRate).toBe(100)
    expect(all.steps.find((step) => step.stepId === 'result')?.viewed).toBe(1)
    expect(alpha.totals.sessionsStarted).toBe(1)
    expect(alpha.campaigns).toEqual(['alpha', 'beta'])
  })

  it('treats viewing a result as completion without requiring a CTA click', async () => {
    const app = createApp()
    const session = await createSession(app)
    await reachResult(app, session.id)
    const resultViewed = event(session.id, 'result_viewed', 'result')

    await app.inject({
      method: 'POST',
      url: '/api/events/batch',
      payload: { events: [resultViewed] }
    })
    const analytics = AnalyticsResponseSchema.parse(
      (await app.inject({ method: 'GET', url: '/api/analytics' })).json()
    )
    const resultStep = analytics.steps.find((step) => step.stepId === 'result')

    expect(analytics.totals).toMatchObject({ resultReached: 1, ctaClicked: 0, ctaCtr: 0 })
    expect(resultStep).toMatchObject({ viewed: 1, completed: 1, dropoff: 0, conversionRate: 100 })
  })
})
