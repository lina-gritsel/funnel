import cors from '@fastify/cors'
import Fastify, { type FastifyInstance } from 'fastify'

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

  return app
}
