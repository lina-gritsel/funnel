import { afterEach, describe, expect, it } from 'vitest'

import { buildApp } from './app.js'

const apps: ReturnType<typeof buildApp>[] = []

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

describe('health endpoint', () => {
  it('reports that the API is available', async () => {
    const app = buildApp({ databasePath: ':memory:' })
    apps.push(app)

    const response = await app.inject({
      method: 'GET',
      url: '/api/health'
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      service: 'funnel-api',
      status: 'ok'
    })
  })
})

describe('active funnel endpoint', () => {
  it('returns the validated active configuration', async () => {
    const app = buildApp({ databasePath: ':memory:' })
    apps.push(app)

    const response = await app.inject({
      method: 'GET',
      url: '/api/funnels/active'
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      id: 'financial-path',
      version: 1,
      status: 'active',
      experiment: {
        variants: {
          A: { weight: 50 },
          B: { weight: 50 }
        }
      }
    })
  })
})
