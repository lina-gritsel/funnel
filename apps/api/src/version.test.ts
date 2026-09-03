import {
  AnalyticsResponseSchema,
  FunnelConfigSchema,
  FunnelVersionsResponseSchema,
  SessionBootstrapResponseSchema,
  type FunnelConfig
} from '@funnel/contracts'
import { afterEach, describe, expect, it } from 'vitest'

import { buildApp } from './app.js'

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

function nextConfig(config: FunnelConfig): FunnelConfig {
  return {
    ...structuredClone(config),
    name: 'Подбор финансового сценария — вторая версия',
    version: config.version + 1,
    status: 'draft',
    createdAt: new Date().toISOString(),
    publishedAt: undefined,
    steps: config.steps.map((step) =>
      step.id === 'welcome' ? { ...step, title: 'Обновлённое приветствие' } : step
    )
  }
}

async function createSession(app: ReturnType<typeof buildApp>) {
  return SessionBootstrapResponseSchema.parse(
    (await app.inject({ method: 'POST', url: '/api/sessions', payload: {} })).json()
  )
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

describe('funnel versioning', () => {
  it('publishes a draft, pins existing sessions and rolls back new traffic', async () => {
    const app = createApp()
    const v1Session = await createSession(app)
    const draft = nextConfig(await activeConfig(app))

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

    const v2Session = await createSession(app)
    expect(v2Session.session.version).toBe(2)
    expect(v2Session.config.steps[0]?.title).toBe('Обновлённое приветствие')

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
  })

  it('rejects an invalid or skipped version without changing the active config', async () => {
    const app = createApp()
    const current = await activeConfig(app)
    const skipped = { ...nextConfig(current), version: 3 }

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
