import { randomUUID } from 'node:crypto'

import {
  AnalyticsResponseSchema,
  EventBatchResponseSchema,
  FunnelConfigSchema,
  FunnelVersionsResponseSchema,
  SessionBootstrapResponseSchema,
  SessionStateResponseSchema,
  type FunnelConfig
} from '@funnel/contracts'
import { afterEach, describe, expect, it } from 'vitest'

import { buildApp } from './app.js'
import { loadFunnelConfig } from './funnel-config.js'

const apps: ReturnType<typeof buildApp>[] = []

function createApp() {
  const app = buildApp({ databasePath: ':memory:', random: () => 0.1 })
  apps.push(app)
  return app
}

async function activeConfig(app: ReturnType<typeof buildApp>) {
  return FunnelConfigSchema.parse(
    (await app.inject({ method: 'GET', url: '/api/funnels/active' })).json()
  )
}

function skippedConfig(config: FunnelConfig): FunnelConfig {
  return {
    ...structuredClone(loadFunnelConfig(2)),
    version: config.version + 2,
    status: 'draft',
    createdAt: new Date().toISOString(),
    publishedAt: undefined
  }
}

async function createSession(app: ReturnType<typeof buildApp>, variant?: 'A' | 'B') {
  return SessionBootstrapResponseSchema.parse(
    (
      await app.inject({
        method: 'POST',
        url: '/api/sessions',
        payload: variant ? { variant } : {}
      })
    ).json()
  )
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

describe('funnel versioning', () => {
  it('publishes a draft, pins existing sessions and rolls back new traffic', async () => {
    const app = createApp()
    const v1Session = await createSession(app)
    const draft = loadFunnelConfig(2)

    const createdResponse = await app.inject({
      method: 'POST',
      url: '/api/funnels/versions',
      payload: { config: draft }
    })
    expect(createdResponse.statusCode).toBe(201)
    expect(FunnelConfigSchema.parse(createdResponse.json())).toMatchObject({
      version: 2,
      status: 'draft'
    })
    expect((await activeConfig(app)).version).toBe(1)

    const published = await app.inject({
      method: 'POST',
      url: '/api/funnels/versions/2/publish'
    })
    expect(FunnelConfigSchema.parse(published.json())).toMatchObject({
      version: 2,
      status: 'active'
    })

    const continuedV1 = SessionStateResponseSchema.parse(
      (
        await app.inject({
          method: 'POST',
          url: `/api/sessions/${v1Session.session.id}/answers`,
          payload: { stepId: 'welcome' }
        })
      ).json()
    )
    expect(continuedV1.session.currentStepId).toBe('goal')

    const v2Session = await createSession(app, 'B')
    expect(v2Session.session.version).toBe(2)
    expect(v2Session.config.customEvents[0]?.name).toBe('investment_horizon_selected')

    const v2Answers = [
      { stepId: 'welcome' },
      { stepId: 'amount', answer: 250000 },
      { stepId: 'goal', answer: 'invest' },
      { stepId: 'priorities', answer: ['support'] },
      { stepId: 'horizon', answer: 'short' },
      { stepId: 'liquidity' },
      { stepId: 'experience', answer: 'beginner' }
    ]
    let currentStepId = 'welcome'
    for (const payload of v2Answers) {
      expect(currentStepId).toBe(payload.stepId)
      const response = SessionStateResponseSchema.parse(
        (
          await app.inject({
            method: 'POST',
            url: `/api/sessions/${v2Session.session.id}/answers`,
            payload
          })
        ).json()
      )
      currentStepId = response.session.currentStepId
    }
    expect(currentStepId).toBe('result')

    const customEvent = {
      eventId: randomUUID(),
      sessionId: v2Session.session.id,
      name: 'investment_horizon_selected',
      clientTimestamp: new Date().toISOString(),
      stepId: 'horizon',
      properties: { next_step_id: 'liquidity' }
    }
    const eventResult = EventBatchResponseSchema.parse(
      (
        await app.inject({
          method: 'POST',
          url: '/api/events/batch',
          payload: { events: [customEvent] }
        })
      ).json()
    )
    expect(eventResult.accepted).toEqual([customEvent.eventId])

    const restoredV1 = SessionBootstrapResponseSchema.parse(
      (
        await app.inject({
          method: 'GET',
          url: `/api/sessions/${v1Session.session.id}`
        })
      ).json()
    )
    expect(restoredV1.session.version).toBe(1)
    expect(restoredV1.config.version).toBe(1)

    const rollback = await app.inject({ method: 'POST', url: '/api/funnels/rollback' })
    expect(FunnelConfigSchema.parse(rollback.json())).toMatchObject({
      version: 1,
      status: 'active'
    })

    const afterRollback = await createSession(app)
    expect(afterRollback.session.version).toBe(1)
    const restoredV2 = SessionBootstrapResponseSchema.parse(
      (
        await app.inject({
          method: 'GET',
          url: `/api/sessions/${v2Session.session.id}`
        })
      ).json()
    )
    expect(restoredV2.session.version).toBe(2)
    expect(restoredV2.config.version).toBe(2)

    const versions = FunnelVersionsResponseSchema.parse(
      (await app.inject({ method: 'GET', url: '/api/funnels/versions' })).json()
    )
    expect(versions.activeVersion).toBe(1)
    expect(versions.versions).toMatchObject([
      { version: 2, status: 'archived' },
      { version: 1, status: 'active' }
    ])

    const analytics = AnalyticsResponseSchema.parse(
      (await app.inject({ method: 'GET', url: '/api/analytics' })).json()
    )
    expect(analytics.versions).toMatchObject([
      { version: 1, sessionsStarted: 2 },
      { version: 2, sessionsStarted: 1 }
    ])
    expect(analytics.steps.some((step) => step.stepId === 'horizon')).toBe(true)
    expect(analytics.steps.find((step) => step.stepId === 'welcome')?.title).toBe(
      v1Session.config.steps.find((step) => step.id === 'welcome')?.title
    )
    expect(analytics.events).toContainEqual({
      name: 'investment_horizon_selected',
      sessions: 1
    })
  })

  it('rejects an invalid or skipped version without changing the active config', async () => {
    const app = createApp()
    const current = await activeConfig(app)
    const skipped = skippedConfig(current)

    const skippedResponse = await app.inject({
      method: 'POST',
      url: '/api/funnels/versions',
      payload: { config: skipped }
    })
    expect(skippedResponse.statusCode).toBe(409)

    const invalidResponse = await app.inject({
      method: 'POST',
      url: '/api/funnels/versions',
      payload: { config: { version: 2 } }
    })
    expect(invalidResponse.statusCode).toBe(422)
    expect((await activeConfig(app)).version).toBe(1)
  })
})
