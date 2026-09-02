import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type {
  CreateSessionRequest,
  FunnelAnswers,
  FunnelConfig,
  FunnelSession,
  FunnelVariantId,
  SessionBootstrapResponse,
  SessionStateResponse,
  SubmitAnswerRequest
} from '@funnel/contracts'
import { advanceRuntime, getStep, moveRuntimeBack, resolveVariant } from '@funnel/engine'
import Database from 'better-sqlite3'

import { loadActiveFunnelConfig, loadFunnelConfig } from './funnel-config.js'

const defaultDatabasePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../data/funnel.db'
)

type SessionRow = {
  id: string
  funnel_id: string
  funnel_version: number
  variant: FunnelVariantId
  current_step_id: string
  trail_json: string
  cursor: number
  answers_json: string
  utm_json: string
  created_at: string
  updated_at: string
  completed_at: string | null
}

type SessionServiceOptions = {
  databasePath?: string
  random?: () => number
}

export class SessionNotFoundError extends Error {
  constructor() {
    super('Session not found')
    this.name = 'SessionNotFoundError'
  }
}

export class SessionConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SessionConflictError'
  }
}

export class SessionInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SessionInputError'
  }
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T
}

function mapSession(row: SessionRow): FunnelSession {
  return {
    id: row.id,
    funnelId: row.funnel_id,
    version: row.funnel_version,
    variant: row.variant,
    currentStepId: row.current_step_id,
    trail: parseJson<string[]>(row.trail_json),
    cursor: row.cursor,
    answers: parseJson<FunnelAnswers>(row.answers_json),
    utm: parseJson<Record<string, string>>(row.utm_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at
  }
}

function pickVariant(config: FunnelConfig, random: () => number): FunnelVariantId {
  return random() * 100 < config.experiment.variants.A.weight ? 'A' : 'B'
}

export class SessionService {
  private readonly database: Database.Database
  private readonly random: () => number

  constructor(options: SessionServiceOptions = {}) {
    const databasePath = options.databasePath ?? defaultDatabasePath
    if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true })

    this.database = new Database(databasePath)
    this.random = options.random ?? Math.random

    if (databasePath !== ':memory:') this.database.pragma('journal_mode = WAL')
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        funnel_id TEXT NOT NULL,
        funnel_version INTEGER NOT NULL,
        variant TEXT NOT NULL CHECK (variant IN ('A', 'B')),
        current_step_id TEXT NOT NULL,
        trail_json TEXT NOT NULL,
        cursor INTEGER NOT NULL,
        answers_json TEXT NOT NULL,
        utm_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT
      )
    `)
  }

  async create(input: CreateSessionRequest): Promise<SessionBootstrapResponse> {
    const config = await loadActiveFunnelConfig()
    const variant = input.variant ?? pickVariant(config, this.random)
    const funnel = resolveVariant(config, variant)
    const timestamp = new Date().toISOString()
    const session: FunnelSession = {
      id: randomUUID(),
      funnelId: config.id,
      version: config.version,
      variant,
      currentStepId: funnel.entryStepId,
      trail: [funnel.entryStepId],
      cursor: 0,
      answers: {},
      utm: input.utm ?? {},
      createdAt: timestamp,
      updatedAt: timestamp,
      completedAt: null
    }

    this.database
      .prepare(
        `INSERT INTO sessions (
          id, funnel_id, funnel_version, variant, current_step_id, trail_json, cursor,
          answers_json, utm_json, created_at, updated_at, completed_at
        ) VALUES (
          @id, @funnelId, @version, @variant, @currentStepId, @trail, @cursor,
          @answers, @utm, @createdAt, @updatedAt, @completedAt
        )`
      )
      .run({
        id: session.id,
        funnelId: session.funnelId,
        version: session.version,
        variant: session.variant,
        currentStepId: session.currentStepId,
        trail: JSON.stringify(session.trail),
        cursor: session.cursor,
        answers: JSON.stringify(session.answers),
        utm: JSON.stringify(session.utm),
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        completedAt: session.completedAt
      })

    return { session, config }
  }

  async get(id: string): Promise<SessionBootstrapResponse> {
    const session = this.getSession(id)
    const config = await loadFunnelConfig(session.version)
    return { session, config }
  }

  async submit(id: string, input: SubmitAnswerRequest): Promise<SessionStateResponse> {
    const session = this.getSession(id)
    if (input.stepId !== session.currentStepId) {
      throw new SessionConflictError('Session has already moved to another step')
    }

    const config = await loadFunnelConfig(session.version)
    const funnel = resolveVariant(config, session.variant)
    const result = advanceRuntime(
      funnel,
      { trail: session.trail, cursor: session.cursor, answers: session.answers },
      input.answer
    )

    if (!result.success) throw new SessionInputError(result.error)

    const currentStepId = result.snapshot.trail[result.snapshot.cursor]
    if (!currentStepId) throw new SessionConflictError('Session state is invalid')

    const completed = getStep(funnel, currentStepId).type === 'result'
    const updatedAt = new Date().toISOString()
    const updated: FunnelSession = {
      ...session,
      ...result.snapshot,
      currentStepId,
      updatedAt,
      completedAt: completed ? (session.completedAt ?? updatedAt) : null
    }

    this.update(updated)
    return { session: updated }
  }

  async back(id: string): Promise<SessionStateResponse> {
    const session = this.getSession(id)
    const snapshot = moveRuntimeBack({
      trail: session.trail,
      cursor: session.cursor,
      answers: session.answers
    })
    const currentStepId = snapshot.trail[snapshot.cursor]
    if (!currentStepId) throw new SessionConflictError('Session state is invalid')

    const updated: FunnelSession = {
      ...session,
      ...snapshot,
      currentStepId,
      updatedAt: new Date().toISOString(),
      completedAt: null
    }

    this.update(updated)
    return { session: updated }
  }

  close() {
    this.database.close()
  }

  private getSession(id: string): FunnelSession {
    const row = this.database.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as
      SessionRow | undefined
    if (!row) throw new SessionNotFoundError()
    return mapSession(row)
  }

  private update(session: FunnelSession) {
    this.database
      .prepare(
        `UPDATE sessions SET
          current_step_id = @currentStepId,
          trail_json = @trail,
          cursor = @cursor,
          answers_json = @answers,
          updated_at = @updatedAt,
          completed_at = @completedAt
        WHERE id = @id`
      )
      .run({
        id: session.id,
        currentStepId: session.currentStepId,
        trail: JSON.stringify(session.trail),
        cursor: session.cursor,
        answers: JSON.stringify(session.answers),
        updatedAt: session.updatedAt,
        completedAt: session.completedAt
      })
  }
}
