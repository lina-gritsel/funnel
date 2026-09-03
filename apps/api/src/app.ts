import { timingSafeEqual } from 'node:crypto'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import cors from '@fastify/cors'
import fastifyStatic from '@fastify/static'
import {
  BackSessionRequestSchema,
  CreateFunnelVersionRequestSchema,
  CreateSessionRequestSchema,
  EventBatchRequestSchema,
  SubmitAnswerRequestSchema
} from '@funnel/contracts'
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify'

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
  adminToken?: string
  databasePath?: string
  environment?: 'development' | 'production' | 'test'
  random?: () => number
  staticRoot?: string | false
}

const defaultStaticRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../web/dist')

function tokenMatches(expected: string, provided: string) {
  const expectedBuffer = Buffer.from(expected)
  const providedBuffer = Buffer.from(provided)
  return (
    expectedBuffer.length === providedBuffer.length &&
    timingSafeEqual(expectedBuffer, providedBuffer)
  )
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
  const environment = options.environment ?? process.env.NODE_ENV ?? 'development'
  const adminToken = options.adminToken ?? process.env.ADMIN_TOKEN
  const adminDisabled = environment === 'production' && !adminToken
  const staticRoot =
    options.staticRoot === undefined
      ? environment === 'production'
        ? defaultStaticRoot
        : false
      : options.staticRoot
  const database = createDatabase(options.databasePath)
  const configs = new FunnelConfigService(database)
  const events = new EventService(database, configs)
  const sessions = new SessionService(database, events, configs, {
    ...(options.random ? { random: options.random } : {})
  })
  const analytics = new AnalyticsService(database, configs)

  app.addHook('onClose', async () => database.close())

  void app.register(cors, {
    origin:
      process.env.WEB_ORIGIN ?? (environment === 'production' ? false : 'http://localhost:5173')
  })

  const requireAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
    if (adminDisabled) {
      return reply.code(503).send({
        message: 'Administrative access is disabled until ADMIN_TOKEN is configured'
      })
    }
    if (!adminToken) return

    const provided = request.headers['x-admin-token']
    if (typeof provided !== 'string' || provided.length === 0) {
      return reply.code(401).send({ message: 'Admin token is required' })
    }
    if (!tokenMatches(adminToken, provided)) {
      return reply.code(403).send({ message: 'Admin token is invalid' })
    }
  }

  app.get('/api/health', async () => ({
    service: 'funnel-api',
    status: 'ok',
    timestamp: new Date().toISOString()
  }))

  app.get('/api/admin/session', { preHandler: requireAdmin }, async () => ({
    authenticated: true,
    protection: adminToken ? 'token' : 'development-open'
  }))

  app.get('/api/funnels/active', async (_request, reply) => {
    try {
      return configs.getActive()
    } catch (error) {
      return sendConfigError(error, reply, app)
    }
  })

  app.get('/api/funnels/versions', { preHandler: requireAdmin }, async (_request, reply) => {
    try {
      return configs.list()
    } catch (error) {
      return sendConfigError(error, reply, app)
    }
  })

  app.post('/api/funnels/validate', { preHandler: requireAdmin }, async (request, reply) => {
    const input = CreateFunnelVersionRequestSchema.safeParse(request.body)
    if (!input.success) return reply.code(400).send({ message: 'Invalid version data' })

    try {
      return configs.preview(input.data.config)
    } catch (error) {
      return sendConfigError(error, reply, app)
    }
  })

  app.post('/api/funnels/versions', { preHandler: requireAdmin }, async (request, reply) => {
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
    { preHandler: requireAdmin },
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

  app.post('/api/funnels/rollback', { preHandler: requireAdmin }, async (_request, reply) => {
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
      const input = BackSessionRequestSchema.safeParse(request.body ?? {})
      if (!input.success) return reply.code(400).send({ message: 'Invalid back navigation data' })

      try {
        return await sessions.back(request.params.sessionId, input.data)
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

  app.get<{ Querystring: { utmCampaign?: string } }>(
    '/api/analytics',
    { preHandler: requireAdmin },
    async (request, reply) => {
      try {
        return await analytics.get(request.query.utmCampaign)
      } catch (error) {
        app.log.error(error)
        return reply.code(500).send({ message: 'Analytics is unavailable' })
      }
    }
  )

  if (staticRoot && existsSync(staticRoot)) {
    void app.register(fastifyStatic, { root: staticRoot })
    app.setNotFoundHandler((request, reply) => {
      const acceptsHtml = request.headers.accept?.includes('text/html')
      if (
        (request.method === 'GET' || request.method === 'HEAD') &&
        !request.url.startsWith('/api/') &&
        acceptsHtml
      ) {
        return reply.sendFile('index.html')
      }
      return reply.code(404).send({ message: 'Not found' })
    })
  }

  return app
}
