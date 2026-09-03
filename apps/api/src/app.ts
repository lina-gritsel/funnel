import cors from '@fastify/cors'
import {
  CreateFunnelVersionRequestSchema,
  CreateSessionRequestSchema,
  EventBatchRequestSchema,
  SubmitAnswerRequestSchema
} from '@funnel/contracts'
import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify'

import { AnalyticsService } from './analytics-service.js'
import { createDatabase } from './database.js'
import { EventService } from './event-service.js'
import {
  FunnelConfigConflictError,
  FunnelConfigNotFoundError,
  FunnelConfigService,
  FunnelConfigValidationError
} from './funnel-config.js'
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

function sendConfigError(error: unknown, reply: FastifyReply, app: FastifyInstance) {
  if (error instanceof FunnelConfigNotFoundError) {
    return reply.code(404).send({ message: error.message })
  }
  if (error instanceof FunnelConfigConflictError) {
    return reply.code(409).send({ message: error.message })
  }
  if (error instanceof FunnelConfigValidationError) {
    return reply.code(422).send({ message: error.message, issues: error.issues })
  }

  app.log.error(error)
  return reply.code(500).send({ message: 'Funnel configuration is unavailable' })
}

function versionParam(value: string) {
  const version = Number(value)
  return Number.isInteger(version) && version > 0 ? version : null
}

export function buildApp(options: AppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: true })
  const database = createDatabase(options.databasePath)
  const configs = new FunnelConfigService(database)
  const events = new EventService(database)
  const sessions = new SessionService(database, events, configs, {
    ...(options.random ? { random: options.random } : {})
  })
  const analytics = new AnalyticsService(database, configs)

  app.addHook('onClose', async () => database.close())

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
      return configs.getActive()
    } catch (error) {
      return sendConfigError(error, reply, app)
    }
  })

  app.get('/api/funnels/versions', async (_request, reply) => {
    try {
      return configs.list()
    } catch (error) {
      return sendConfigError(error, reply, app)
    }
  })

  app.post('/api/funnels/versions', async (request, reply) => {
    const input = CreateFunnelVersionRequestSchema.safeParse(request.body)
    if (!input.success) return reply.code(400).send({ message: 'Invalid version data' })

    try {
      return reply.code(201).send(configs.create(input.data.config))
    } catch (error) {
      return sendConfigError(error, reply, app)
    }
  })

  app.post<{ Params: { version: string } }>(
    '/api/funnels/versions/:version/publish',
    async (request, reply) => {
      const version = versionParam(request.params.version)
      if (!version) return reply.code(400).send({ message: 'Invalid funnel version' })

      try {
        return configs.publish(version)
      } catch (error) {
        return sendConfigError(error, reply, app)
      }
    }
  )

  app.post('/api/funnels/rollback', async (_request, reply) => {
    try {
      return configs.rollback()
    } catch (error) {
      return sendConfigError(error, reply, app)
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

  app.post('/api/events/batch', async (request, reply) => {
    const input = EventBatchRequestSchema.safeParse(request.body)
    if (!input.success) return reply.code(400).send({ message: 'Invalid event batch' })
    return events.ingest(input.data.events)
  })

  app.get<{ Querystring: { utmCampaign?: string } }>('/api/analytics', async (request, reply) => {
    try {
      return await analytics.get(request.query.utmCampaign)
    } catch (error) {
      app.log.error(error)
      return reply.code(500).send({ message: 'Analytics is unavailable' })
    }
  })

  return app
}
