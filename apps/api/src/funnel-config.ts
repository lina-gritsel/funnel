import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  FunnelConfigSchema,
  type FunnelConfig,
  type FunnelVersionsResponse
} from '@funnel/contracts'

import type { AppDatabase } from './database.js'

const configDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../../../configs')

type FunnelVersionRow = {
  funnel_id: string
  version: number
  status: FunnelConfig['status']
  config_json: string
  created_at: string
  published_at: string | null
}

export class FunnelConfigValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid funnel config:\n${issues.map((issue) => `- ${issue}`).join('\n')}`)
    this.name = 'FunnelConfigValidationError'
  }
}

export function parseFunnelConfig(value: unknown): FunnelConfig {
  const result = FunnelConfigSchema.safeParse(value)

  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''
      return `${path}${issue.message}`
    })
    throw new FunnelConfigValidationError(issues)
  }

  return result.data
}

export class FunnelConfigNotFoundError extends Error {
  constructor(message = 'Funnel version not found') {
    super(message)
    this.name = 'FunnelConfigNotFoundError'
  }
}

export class FunnelConfigConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FunnelConfigConflictError'
  }
}

export function loadFunnelConfig(version: number): FunnelConfig {
  const source = readFileSync(resolve(configDirectory, `funnel-v${version}.json`), 'utf8')
  return parseFunnelConfig(JSON.parse(source) as unknown)
}

export function loadActiveFunnelConfig(): FunnelConfig {
  return loadFunnelConfig(1)
}

function mapConfig(row: FunnelVersionRow): FunnelConfig {
  const config = structuredClone(parseFunnelConfig(JSON.parse(row.config_json) as unknown))
  delete config.publishedAt

  return {
    ...config,
    status: row.status,
    createdAt: row.created_at,
    ...(row.published_at ? { publishedAt: row.published_at } : {})
  }
}

export class FunnelConfigService {
  constructor(private readonly database: AppDatabase) {
    this.seedBundledConfig()
  }

  getActive(): FunnelConfig {
    const row = this.database
      .prepare(`SELECT * FROM funnel_versions WHERE status = 'active' LIMIT 1`)
      .get() as FunnelVersionRow | undefined
    if (!row) throw new FunnelConfigNotFoundError('Active funnel version not found')
    return mapConfig(row)
  }

  getVersion(version: number): FunnelConfig {
    const active = this.getActive()
    const row = this.database
      .prepare('SELECT * FROM funnel_versions WHERE funnel_id = ? AND version = ?')
      .get(active.id, version) as FunnelVersionRow | undefined
    if (!row) throw new FunnelConfigNotFoundError()
    return mapConfig(row)
  }

  getAll(): FunnelConfig[] {
    const active = this.getActive()
    const rows = this.database
      .prepare(
        `SELECT * FROM funnel_versions
         WHERE funnel_id = ?
         ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, version DESC`
      )
      .all(active.id) as FunnelVersionRow[]

    return rows.map(mapConfig)
  }

  list(): FunnelVersionsResponse {
    const active = this.getActive()
    const rows = this.database
      .prepare('SELECT * FROM funnel_versions WHERE funnel_id = ? ORDER BY version DESC')
      .all(active.id) as FunnelVersionRow[]

    return {
      activeVersion: active.version,
      versions: rows.map((row) => ({
        funnelId: row.funnel_id,
        version: row.version,
        status: row.status,
        createdAt: row.created_at,
        publishedAt: row.published_at
      }))
    }
  }

  create(value: unknown): FunnelConfig {
    const input = parseFunnelConfig(value)
    const active = this.getActive()
    if (input.id !== active.id) {
      throw new FunnelConfigConflictError(`Funnel id must remain ${active.id}`)
    }

    const maximum = this.database
      .prepare('SELECT MAX(version) AS version FROM funnel_versions WHERE funnel_id = ?')
      .get(active.id) as { version: number }
    const expectedVersion = maximum.version + 1
    if (input.version !== expectedVersion) {
      throw new FunnelConfigConflictError(`Next funnel version must be ${expectedVersion}`)
    }

    const timestamp = new Date().toISOString()
    const draft: FunnelConfig = {
      ...structuredClone(input),
      status: 'draft',
      createdAt: timestamp
    }
    delete draft.publishedAt

    try {
      this.database
        .prepare(
          `INSERT INTO funnel_versions (
            funnel_id, version, status, config_json, created_at, published_at
          ) VALUES (?, ?, 'draft', ?, ?, NULL)`
        )
        .run(draft.id, draft.version, JSON.stringify(draft), timestamp)
    } catch {
      throw new FunnelConfigConflictError(`Funnel version ${draft.version} already exists`)
    }

    return draft
  }

  publish(version: number): FunnelConfig {
    const active = this.getActive()
    const target = this.database
      .prepare('SELECT * FROM funnel_versions WHERE funnel_id = ? AND version = ?')
      .get(active.id, version) as FunnelVersionRow | undefined
    if (!target) throw new FunnelConfigNotFoundError()
    if (target.status !== 'draft') {
      throw new FunnelConfigConflictError('Only a draft version can be published')
    }

    const publishedAt = new Date().toISOString()
    this.database.transaction(() => {
      this.database
        .prepare(
          `UPDATE funnel_versions SET status = 'archived'
           WHERE funnel_id = ? AND status = 'active'`
        )
        .run(active.id)
      this.database
        .prepare(
          `UPDATE funnel_versions
           SET status = 'active', published_at = ?
           WHERE funnel_id = ? AND version = ?`
        )
        .run(publishedAt, active.id, version)
    })()

    return this.getActive()
  }

  rollback(): FunnelConfig {
    const active = this.getActive()
    const previous = this.database
      .prepare(
        `SELECT * FROM funnel_versions
         WHERE funnel_id = ? AND version < ? AND published_at IS NOT NULL
         ORDER BY version DESC LIMIT 1`
      )
      .get(active.id, active.version) as FunnelVersionRow | undefined
    if (!previous) throw new FunnelConfigConflictError('No previous published version available')

    this.database.transaction(() => {
      this.database
        .prepare(
          `UPDATE funnel_versions SET status = 'archived'
           WHERE funnel_id = ? AND status = 'active'`
        )
        .run(active.id)
      this.database
        .prepare(
          `UPDATE funnel_versions SET status = 'active'
           WHERE funnel_id = ? AND version = ?`
        )
        .run(active.id, previous.version)
    })()

    return this.getActive()
  }

  private seedBundledConfig() {
    const existing = this.database.prepare('SELECT 1 FROM funnel_versions LIMIT 1').get()
    if (existing) return

    const config = loadActiveFunnelConfig()
    this.database
      .prepare(
        `INSERT INTO funnel_versions (
          funnel_id, version, status, config_json, created_at, published_at
        ) VALUES (?, ?, 'active', ?, ?, ?)`
      )
      .run(
        config.id,
        config.version,
        JSON.stringify(config),
        config.createdAt,
        config.publishedAt ?? config.createdAt
      )
  }
}
