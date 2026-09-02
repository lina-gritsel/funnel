import cors from '@fastify/cors'
import Fastify, { type FastifyInstance } from 'fastify'

import { loadActiveFunnelConfig } from './funnel-config.js'

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: true })

  void app.register(cors, {
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173'
  })

  app.get('/api/health', async () => ({
    service: 'funnel-api',
    status: 'ok',
    timestamp: new Date().toISOString()
  }))

  app.get('/api/funnels/active', async (_request, reply) => {
    try {
      return await loadActiveFunnelConfig()
    } catch (error) {
      app.log.error(error)
      return reply.code(500).send({ message: 'Active funnel config is unavailable' })
    }
  })

  return app
}
