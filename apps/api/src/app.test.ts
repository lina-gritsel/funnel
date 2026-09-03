import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { FunnelConfigPreviewResponseSchema } from '@funnel/contracts'
import { afterEach, describe, expect, it } from 'vitest'

import { buildApp } from './app.js'
import { loadFunnelConfig } from './funnel-config.js'

const apps: ReturnType<typeof buildApp>[] = []
const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
  temporaryDirectories.splice(0).forEach((directory) => rmSync(directory, { recursive: true }))
})

describe('admin access', () => {
  it('protects admin APIs without affecting the public funnel', async () => {
    const app = buildApp({ adminToken: 'test-admin-secret', databasePath: ':memory:' })
    apps.push(app)

    const publicResponse = await app.inject({ method: 'GET', url: '/api/funnels/active' })
    const missingToken = await app.inject({ method: 'GET', url: '/api/funnels/versions' })
    const wrongToken = await app.inject({
      method: 'GET',
      url: '/api/funnels/versions',
      headers: { 'x-admin-token': 'wrong-secret' }
    })
    const validToken = await app.inject({
      method: 'GET',
      url: '/api/funnels/versions',
      headers: { 'x-admin-token': 'test-admin-secret' }
    })

    expect(publicResponse.statusCode).toBe(200)
    expect(missingToken.statusCode).toBe(401)
    expect(wrongToken.statusCode).toBe(403)
    expect(validToken.statusCode).toBe(200)
  })

  it('keeps admin APIs disabled in production until a token is configured', async () => {
    const app = buildApp({ databasePath: ':memory:', environment: 'production' })
    apps.push(app)

    const response = await app.inject({ method: 'GET', url: '/api/analytics' })

    expect(response.statusCode).toBe(503)
  })
})

describe('production frontend', () => {
  it('serves the SPA entry point for frontend routes', async () => {
    const staticRoot = mkdtempSync(join(tmpdir(), 'funnel-static-'))
    temporaryDirectories.push(staticRoot)
    writeFileSync(join(staticRoot, 'index.html'), '<main>Funnel production SPA</main>')
    const app = buildApp({ databasePath: ':memory:', staticRoot })
    apps.push(app)

    const response = await app.inject({
      method: 'GET',
      url: '/admin/analytics',
      headers: { accept: 'text/html' }
    })

    expect(response.statusCode).toBe(200)
    expect(response.body).toContain('Funnel production SPA')
  })
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

  it('offers a dry-run preview for a safe configuration', async () => {
    const app = buildApp({ databasePath: ':memory:' })
    apps.push(app)

    const response = await app.inject({
      method: 'POST',
      url: '/api/funnels/validate',
      payload: { config: loadFunnelConfig(2) }
    })
    const preview = FunnelConfigPreviewResponseSchema.parse(response.json())

    expect(response.statusCode).toBe(200)
    expect(preview).toMatchObject({ valid: true, version: 2 })
  })
})
