import { SessionBootstrapResponseSchema, SessionStateResponseSchema } from '@funnel/contracts'
import { afterEach, describe, expect, it } from 'vitest'

import { buildApp } from './app.js'

const apps: ReturnType<typeof buildApp>[] = []

function createApp(random = () => 0.1) {
  const app = buildApp({ databasePath: ':memory:', random })
  apps.push(app)
  return app
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

describe('funnel sessions', () => {
  it('creates and restores the same pinned version and variant', async () => {
    const app = createApp(() => 0.99)
    const createdResponse = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: { utm: { utm_source: 'test' } }
    })
    const created = SessionBootstrapResponseSchema.parse(createdResponse.json())

    expect(createdResponse.statusCode).toBe(201)
    expect(created.session.variant).toBe('B')
    expect(created.session.version).toBe(1)

    const restoredResponse = await app.inject({
      method: 'GET',
      url: `/api/sessions/${created.session.id}`
    })
    const restored = SessionBootstrapResponseSchema.parse(restoredResponse.json())

    expect(restored.session.variant).toBe('B')
    expect(restored.session.version).toBe(1)
    expect(restored.session.utm).toEqual({ utm_source: 'test' })
  })

  it('persists answers and restores the current step', async () => {
    const app = createApp()
    const created = SessionBootstrapResponseSchema.parse(
      (
        await app.inject({
          method: 'POST',
          url: '/api/sessions',
          payload: { variant: 'A' }
        })
      ).json()
    )

    await app.inject({
      method: 'POST',
      url: `/api/sessions/${created.session.id}/answers`,
      payload: { stepId: 'welcome' }
    })
    await app.inject({
      method: 'POST',
      url: `/api/sessions/${created.session.id}/answers`,
      payload: { stepId: 'goal', answer: 'invest' }
    })
    await app.inject({
      method: 'POST',
      url: `/api/sessions/${created.session.id}/answers`,
      payload: { stepId: 'amount', answer: 500000 }
    })

    const restored = SessionBootstrapResponseSchema.parse(
      (
        await app.inject({
          method: 'GET',
          url: `/api/sessions/${created.session.id}`
        })
      ).json()
    )

    expect(restored.session.currentStepId).toBe('priorities')
    expect(restored.session.answers).toMatchObject({ goal: 'invest', amount: 500000 })
  })

  it('returns to the previous step without deleting its answer', async () => {
    const app = createApp()
    const created = SessionBootstrapResponseSchema.parse(
      (
        await app.inject({
          method: 'POST',
          url: '/api/sessions',
          payload: { variant: 'A' }
        })
      ).json()
    )

    for (const payload of [
      { stepId: 'welcome' },
      { stepId: 'goal', answer: 'invest' },
      { stepId: 'amount', answer: 500000 }
    ]) {
      await app.inject({
        method: 'POST',
        url: `/api/sessions/${created.session.id}/answers`,
        payload
      })
    }

    const response = await app.inject({
      method: 'POST',
      url: `/api/sessions/${created.session.id}/back`
    })
    const state = SessionStateResponseSchema.parse(response.json())

    expect(state.session.currentStepId).toBe('amount')
    expect(state.session.answers.amount).toBe(500000)
  })

  it('rejects stale steps and invalid answers', async () => {
    const app = createApp()
    const created = SessionBootstrapResponseSchema.parse(
      (
        await app.inject({
          method: 'POST',
          url: '/api/sessions',
          payload: { variant: 'A' }
        })
      ).json()
    )

    const stale = await app.inject({
      method: 'POST',
      url: `/api/sessions/${created.session.id}/answers`,
      payload: { stepId: 'goal', answer: 'invest' }
    })
    expect(stale.statusCode).toBe(409)

    await app.inject({
      method: 'POST',
      url: `/api/sessions/${created.session.id}/answers`,
      payload: { stepId: 'welcome' }
    })
    await app.inject({
      method: 'POST',
      url: `/api/sessions/${created.session.id}/answers`,
      payload: { stepId: 'goal', answer: 'invest' }
    })
    const invalid = await app.inject({
      method: 'POST',
      url: `/api/sessions/${created.session.id}/answers`,
      payload: { stepId: 'amount', answer: 100 }
    })

    expect(invalid.statusCode).toBe(422)
  })
})
