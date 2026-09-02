import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import Database from 'better-sqlite3'

const defaultDatabasePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../data/funnel.db'
)

export function createDatabase(databasePath = defaultDatabasePath) {
  if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true })

  const database = new Database(databasePath)
  database.pragma('foreign_keys = ON')
  if (databasePath !== ':memory:') database.pragma('journal_mode = WAL')
  database.exec(`
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
    );

    CREATE TABLE IF NOT EXISTS events (
      event_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      event_name TEXT NOT NULL,
      client_timestamp TEXT NOT NULL,
      server_timestamp TEXT NOT NULL,
      funnel_id TEXT NOT NULL,
      funnel_version INTEGER NOT NULL,
      variant TEXT NOT NULL CHECK (variant IN ('A', 'B')),
      step_id TEXT NOT NULL,
      utm_json TEXT NOT NULL,
      utm_campaign TEXT,
      properties_json TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );

    CREATE INDEX IF NOT EXISTS events_session_id_idx ON events(session_id);
    CREATE INDEX IF NOT EXISTS events_name_idx ON events(event_name);
    CREATE INDEX IF NOT EXISTS events_campaign_idx ON events(utm_campaign);
  `)
  return database
}

export type AppDatabase = ReturnType<typeof createDatabase>
