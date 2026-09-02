import type { AnalyticsResponse, FunnelVariantId } from '@funnel/contracts'

import type { AppDatabase } from './database.js'
import { loadActiveFunnelConfig } from './funnel-config.js'

type TotalsRow = {
  sessions_started: number
  result_reached: number
  cta_clicked: number
}

type VariantRow = TotalsRow & { variant: FunnelVariantId }
type VersionRow = TotalsRow & { version: number }
type StepRow = {
  step_id: string
  viewed: number
  completed: number
  cta_clicked: number
}

function percentage(value: number, total: number) {
  return total === 0 ? 0 : Number(((value / total) * 100).toFixed(1))
}

function metrics(row: TotalsRow) {
  return {
    sessionsStarted: row.sessions_started,
    resultReached: row.result_reached,
    ctaClicked: row.cta_clicked,
    resultRate: percentage(row.result_reached, row.sessions_started),
    ctaCtr: percentage(row.cta_clicked, row.result_reached)
  }
}

const totalsSelect = `
  COUNT(DISTINCT CASE WHEN event_name = 'session_started' THEN session_id END) AS sessions_started,
  COUNT(DISTINCT CASE WHEN event_name = 'result_viewed' THEN session_id END) AS result_reached,
  COUNT(DISTINCT CASE WHEN event_name = 'cta_clicked' THEN session_id END) AS cta_clicked
`

export class AnalyticsService {
  constructor(private readonly database: AppDatabase) {}

  async get(utmCampaign?: string): Promise<AnalyticsResponse> {
    const cohort = `session_id IN (
      SELECT session_id FROM events WHERE event_name = 'session_started'
    )`
    const where = utmCampaign
      ? `WHERE ${cohort} AND utm_campaign = @utmCampaign`
      : `WHERE ${cohort}`
    const params = utmCampaign ? { utmCampaign } : {}
    const totals = this.database
      .prepare(`SELECT ${totalsSelect} FROM events ${where}`)
      .get(params) as TotalsRow
    const variantRows = this.database
      .prepare(`SELECT variant, ${totalsSelect} FROM events ${where} GROUP BY variant`)
      .all(params) as VariantRow[]
    const versionRows = this.database
      .prepare(
        `SELECT funnel_version AS version, ${totalsSelect}
         FROM events ${where} GROUP BY funnel_version ORDER BY funnel_version`
      )
      .all(params) as VersionRow[]
    const stepRows = this.database
      .prepare(
        `SELECT
          step_id,
          COUNT(DISTINCT CASE WHEN event_name = 'step_viewed' THEN session_id END) AS viewed,
          COUNT(DISTINCT CASE WHEN event_name = 'step_completed' THEN session_id END) AS completed,
          COUNT(DISTINCT CASE WHEN event_name = 'cta_clicked' THEN session_id END) AS cta_clicked
         FROM events ${where} GROUP BY step_id`
      )
      .all(params) as StepRow[]
    const campaigns = (
      this.database
        .prepare(
          `SELECT DISTINCT utm_campaign FROM events
           WHERE event_name = 'session_started'
             AND utm_campaign IS NOT NULL
             AND utm_campaign != ''
           ORDER BY utm_campaign`
        )
        .all() as { utm_campaign: string }[]
    ).map((row) => row.utm_campaign)

    const config = await loadActiveFunnelConfig()
    const stepsById = new Map(stepRows.map((row) => [row.step_id, row]))

    return {
      totals: metrics(totals),
      variants: (['A', 'B'] as const).map((variant) => {
        const row = variantRows.find((candidate) => candidate.variant === variant) ?? {
          variant,
          sessions_started: 0,
          result_reached: 0,
          cta_clicked: 0
        }
        return { variant, ...metrics(row) }
      }),
      versions: versionRows.map((row) => ({ version: row.version, ...metrics(row) })),
      steps: config.steps.map((step) => {
        const row = stepsById.get(step.id) ?? {
          step_id: step.id,
          viewed: 0,
          completed: 0,
          cta_clicked: 0
        }
        const completed = step.type === 'result' ? row.cta_clicked : row.completed
        return {
          stepId: step.id,
          title: step.title,
          viewed: row.viewed,
          completed,
          dropoff: Math.max(row.viewed - completed, 0),
          conversionRate: percentage(completed, row.viewed)
        }
      }),
      campaigns,
      activeCampaign: utmCampaign ?? null
    }
  }
}
