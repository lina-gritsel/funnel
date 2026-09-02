import cors from '@fastify/cors'
import { CreateSessionRequestSchema, SubmitAnswerRequestSchema } from '@funnel/contracts'
import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify'

import { loadActiveFunnelConfig } from './funnel-config.js'
import {
  SessionConflictError,
  SessionInputError,
  SessionNotFoundError,
  SessionService
} from './session-service.js'

type AppOptions = {
  databasePath?: string
  random?: () => number
}

function sendSessionError(error: unknown, reply: FastifyReply, app: FastifyInstance) {
  if (error instanceof SessionNotFoundError) {
    return reply.code(404).send({ message: error.message })
  }
  if (error instanceof SessionConflictError) {
    return reply.code(409).send({ message: error.message })
  }
  if (error instanceof SessionInputError) {
    return reply.code(422).send({ message: error.message })
  }

  app.log.error(error)
  return reply.code(500).send({ message: 'Session is unavailable' })
}

export function buildApp(options: AppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: true })
  const sessions = new SessionService(options)

  app.addHook('onClose', async () => sessions.close())

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

  app.post('/api/sessions', async (request, reply) => {
    const input = CreateSessionRequestSchema.safeParse(request.body ?? {})
    if (!input.success) return reply.code(400).send({ message: 'Invalid session data' })

    try {
      return reply.code(201).send(await sessions.create(input.data))
    } catch (error) {
      return sendSessionError(error, reply, app)
    }
  })

  app.get<{ Params: { sessionId: string } }>('/api/sessions/:sessionId', async (request, reply) => {
    try {
      return await sessions.get(request.params.sessionId)
    } catch (error) {
      return sendSessionError(error, reply, app)
    }
  })

  app.post<{ Params: { sessionId: string } }>(
    '/api/sessions/:sessionId/answers',
    async (request, reply) => {
      const input = SubmitAnswerRequestSchema.safeParse(request.body)
      if (!input.success) return reply.code(400).send({ message: 'Invalid answer data' })

      try {
        return await sessions.submit(request.params.sessionId, input.data)
      } catch (error) {
        return sendSessionError(error, reply, app)
      }
    }
  )

  app.post<{ Params: { sessionId: string } }>(
    '/api/sessions/:sessionId/back',
    async (request, reply) => {
      try {
        return await sessions.back(request.params.sessionId)
      } catch (error) {
        return sendSessionError(error, reply, app)
      }
    }
  )

  return app
}
