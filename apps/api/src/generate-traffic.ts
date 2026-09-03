import { randomUUID } from 'node:crypto'

import {
  AnalyticsResponseSchema,
  EventBatchResponseSchema,
  FunnelConfigSchema,
  SessionBootstrapResponseSchema,
  SessionStateResponseSchema,
  type AnalyticsResponse,
  type ClientFunnelEvent,
  type FunnelAnswer,
  type FunnelCustomEvent,
  type FunnelEventProperties
} from '@funnel/contracts'

import {
  createTrafficPlan,
  getScenarioRoute,
  summarizeTrafficPlan,
  trafficCampaigns,
  type TrafficMetricCounts,
  type TrafficScenario,
  type TrafficStepId
} from './traffic-plan.js'

const batchSize = 50
const apiUrl = (process.env.FUNNEL_API_URL ?? 'http://localhost:3001').replace(/\/$/, '')

class Timeline {
  private offset = 0

  constructor(private readonly startedAt: number) {}

  next() {
    const timestamp = new Date(this.startedAt + this.offset).toISOString()
    this.offset += 1000
    return timestamp
  }
}

async function requestJson<T>(
  path: string,
  init: RequestInit,
  parse: (value: unknown) => T
): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, init)
  const body = (await response.json()) as unknown

  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'message' in body
        ? String(Reflect.get(body, 'message'))
        : `HTTP ${response.status}`
    throw new Error(`${init.method ?? 'GET'} ${path}: ${message}`)
  }

  return parse(body)
}

function getJson<T>(path: string, parse: (value: unknown) => T) {
  return requestJson(path, { method: 'GET' }, parse)
}

function postJson<T>(path: string, payload: unknown, parse: (value: unknown) => T) {
  return requestJson(
    path,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    },
    parse
  )
}

function createEvent(
  sessionId: string,
  name: ClientFunnelEvent['name'],
  stepId: string,
  clientTimestamp: string,
  properties: FunnelEventProperties = {}
): ClientFunnelEvent {
  return {
    eventId: randomUUID(),
    sessionId,
    name,
    clientTimestamp,
    stepId,
    properties
  }
}

function answerFor(stepId: TrafficStepId, scenario: TrafficScenario): FunnelAnswer | undefined {
  switch (stepId) {
    case 'goal':
      return ['invest', 'save', 'finance'][scenario.index % 3]
    case 'amount':
      return 100000 + scenario.index * 25000
    case 'priorities':
      return scenario.index % 2 === 0 ? ['speed'] : ['support', 'flexibility']
    case 'experience':
      return scenario.branch
    case 'horizon':
      return scenario.horizon
    default:
      return undefined
  }
}

function answerProperties(stepId: TrafficStepId, answer: FunnelAnswer | undefined) {
  switch (stepId) {
    case 'goal':
    case 'experience':
    case 'horizon':
      return { answer_type: 'single-select' }
    case 'amount':
      return { answer_type: 'number' }
    case 'priorities':
      return {
        answer_type: 'multi-select',
        selected_count: Array.isArray(answer) ? answer.length : 0
      }
    default:
      return null
  }
}

async function submitStep({
  sessionId,
  stepId,
  expectedNextStepId,
  scenario,
  customEvents,
  timeline,
  events
}: {
  sessionId: string
  stepId: TrafficStepId
  expectedNextStepId: TrafficStepId
  scenario: TrafficScenario
  customEvents: FunnelCustomEvent[]
  timeline: Timeline
  events: ClientFunnelEvent[]
}) {
  const answer = answerFor(stepId, scenario)
  const timestamp = timeline.next()
  const response = await postJson(
    `/api/sessions/${sessionId}/answers`,
    {
      stepId,
      ...(answer !== undefined ? { answer } : {})
    },
    (value) => SessionStateResponseSchema.parse(value)
  )

  if (response.session.currentStepId !== expectedNextStepId) {
    throw new Error(
      `Session ${sessionId} moved from ${stepId} to ${response.session.currentStepId}, expected ${expectedNextStepId}`
    )
  }

  const properties = answerProperties(stepId, answer)
  if (properties) {
    events.push(createEvent(sessionId, 'answer_submitted', stepId, timestamp, properties))
  }
  events.push(
    createEvent(sessionId, 'step_completed', stepId, timestamp, {
      next_step_id: expectedNextStepId
    }),
    createEvent(sessionId, 'step_viewed', expectedNextStepId, timeline.next(), {
      view_reason: 'forward'
    })
  )
  customEvents
    .filter((event) => event.trigger === 'step_completed' && event.stepId === stepId)
    .forEach((event) =>
      events.push(
        createEvent(sessionId, event.name, stepId, timestamp, {
          next_step_id: expectedNextStepId
        })
      )
    )
  if (expectedNextStepId === 'result') {
    events.push(createEvent(sessionId, 'result_viewed', 'result', timeline.next()))
  }

  return response.session
}

async function runScenario(scenario: TrafficScenario, expectedVersion: number) {
  const timeline = new Timeline(Date.now() - (100 - scenario.index) * 60_000)
  const bootstrap = await postJson(
    '/api/sessions',
    {
      variant: scenario.variant,
      clientTimestamp: timeline.next(),
      utm: {
        utm_campaign: scenario.campaign.campaign,
        utm_source: scenario.campaign.source,
        utm_medium: scenario.campaign.medium,
        utm_content: `scenario-${String(scenario.index + 1).padStart(3, '0')}`
      }
    },
    (value) => SessionBootstrapResponseSchema.parse(value)
  )

  if (bootstrap.session.variant !== scenario.variant) {
    throw new Error(`Session ${bootstrap.session.id} received an unexpected variant`)
  }
  if (bootstrap.session.version !== expectedVersion) {
    throw new Error(`Session ${bootstrap.session.id} received an unexpected funnel version`)
  }

  const sessionId = bootstrap.session.id
  const route = getScenarioRoute(scenario)
  const events: ClientFunnelEvent[] = [
    createEvent(sessionId, 'step_viewed', 'welcome', timeline.next(), {
      view_reason: 'initial'
    })
  ]
  if (scenario.repeatView) {
    events.push(
      createEvent(sessionId, 'step_viewed', 'welcome', timeline.next(), {
        view_reason: 'repeat'
      })
    )
  }

  let currentStepId: TrafficStepId = 'welcome'
  let usedBack = false

  for (let routeIndex = 0; routeIndex < route.length; routeIndex += 1) {
    const stepId = route[routeIndex]
    if (!stepId || currentStepId !== stepId) {
      throw new Error(`Session ${sessionId} route is inconsistent at index ${routeIndex}`)
    }
    if (scenario.dropAt === stepId) break

    if (stepId === 'result') {
      if (scenario.clickCta) {
        events.push(
          createEvent(sessionId, 'cta_clicked', 'result', timeline.next(), {
            cta_id: 'primary'
          })
        )
      }
      break
    }

    if (scenario.useBack && stepId === 'priorities' && !usedBack) {
      const previousStepId = route[routeIndex - 1]
      if (!previousStepId) throw new Error('Back scenario requires a previous step')
      const backTimestamp = timeline.next()
      const back = await postJson(`/api/sessions/${sessionId}/back`, {}, (value) =>
        SessionStateResponseSchema.parse(value)
      )
      if (back.session.currentStepId !== previousStepId) {
        throw new Error(`Session ${sessionId} returned to an unexpected step`)
      }
      events.push(
        createEvent(sessionId, 'back_clicked', 'priorities', backTimestamp, {
          from_step_id: 'priorities',
          to_step_id: previousStepId
        }),
        createEvent(sessionId, 'step_viewed', previousStepId, timeline.next(), {
          view_reason: 'back'
        })
      )
      await submitStep({
        sessionId,
        stepId: previousStepId,
        expectedNextStepId: 'priorities',
        scenario,
        customEvents: bootstrap.config.customEvents,
        timeline,
        events
      })
      usedBack = true
    }

    const nextStepId = route[routeIndex + 1]
    if (!nextStepId) throw new Error(`Step ${stepId} requires a next step`)
    const updated = await submitStep({
      sessionId,
      stepId,
      expectedNextStepId: nextStepId,
      scenario,
      customEvents: bootstrap.config.customEvents,
      timeline,
      events
    })
    currentStepId = updated.currentStepId as TrafficStepId
  }

  return scenario.deliverOutOfOrder ? [...events].reverse() : events
}

async function fetchAnalytics(campaign?: string) {
  const search = campaign ? `?utmCampaign=${encodeURIComponent(campaign)}` : ''
  return getJson(`/api/analytics${search}`, (value) => AnalyticsResponseSchema.parse(value))
}

function metricDelta(before: TrafficMetricCounts, after: TrafficMetricCounts) {
  return {
    sessionsStarted: after.sessionsStarted - before.sessionsStarted,
    resultReached: after.resultReached - before.resultReached,
    ctaClicked: after.ctaClicked - before.ctaClicked
  }
}

function expectEqual(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${label}: received ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`
    )
  }
}

function validateAnalyticsDelta({
  label,
  before,
  after,
  scenarios,
  customEvents
}: {
  label: string
  before: AnalyticsResponse
  after: AnalyticsResponse
  scenarios: TrafficScenario[]
  customEvents: FunnelCustomEvent[]
}) {
  const expected = summarizeTrafficPlan(scenarios, customEvents)
  expectEqual(label, metricDelta(before.totals, after.totals), expected.totals)

  for (const variant of ['A', 'B'] as const) {
    const beforeVariant = before.variants.find((item) => item.variant === variant)
    const afterVariant = after.variants.find((item) => item.variant === variant)
    if (!beforeVariant || !afterVariant) throw new Error(`${label}: variant ${variant} is missing`)
    expectEqual(
      `${label}, variant ${variant}`,
      metricDelta(beforeVariant, afterVariant),
      expected.variants[variant]
    )
  }

  for (const [stepId, expectedStep] of Object.entries(expected.steps)) {
    const beforeStep = before.steps.find((item) => item.stepId === stepId)
    const afterStep = after.steps.find((item) => item.stepId === stepId)
    if (!beforeStep || !afterStep) throw new Error(`${label}: step ${stepId} is missing`)
    expectEqual(
      `${label}, step ${stepId}`,
      {
        viewed: afterStep.viewed - beforeStep.viewed,
        completed: afterStep.completed - beforeStep.completed
      },
      expectedStep
    )
  }

  for (const [eventName, expectedSessions] of Object.entries(expected.events)) {
    const beforeEvent = before.events.find((event) => event.name === eventName)?.sessions ?? 0
    const afterEvent = after.events.find((event) => event.name === eventName)?.sessions ?? 0
    expectEqual(`${label}, event ${eventName}`, afterEvent - beforeEvent, expectedSessions)
  }
}

async function main() {
  const config = await getJson('/api/funnels/active', (value) => FunnelConfigSchema.parse(value))
  const requiredSteps: TrafficStepId[] = [
    'welcome',
    'goal',
    'amount',
    'priorities',
    ...(config.version >= 2 ? (['horizon', 'liquidity'] as const) : []),
    'experience',
    'education',
    'result'
  ]
  const activeSteps = new Set(config.steps.map(({ id }) => id))
  const missingSteps = requiredSteps.filter((stepId) => !activeSteps.has(stepId))
  if (missingSteps.length > 0) {
    throw new Error(`Active funnel is missing required steps: ${missingSteps.join(', ')}`)
  }

  const scenarios = createTrafficPlan(config.version)
  const expected = summarizeTrafficPlan(scenarios, config.customEvents)
  const beforeAll = await fetchAnalytics()
  const beforeCampaigns = new Map(
    await Promise.all(
      trafficCampaigns.map(
        async ({ campaign }) => [campaign, await fetchAnalytics(campaign)] as const
      )
    )
  )

  console.log(`Generating ${scenarios.length} sessions against ${apiUrl}`)
  const events: ClientFunnelEvent[] = []
  for (const scenario of scenarios) {
    events.push(...(await runScenario(scenario, config.version)))
    if ((scenario.index + 1) % 20 === 0) {
      console.log(`Created ${scenario.index + 1}/${scenarios.length} sessions`)
    }
  }

  let accepted = 0
  let duplicates = 0
  const batches: ClientFunnelEvent[][] = []
  for (let index = 0; index < events.length; index += batchSize) {
    batches.push(events.slice(index, index + batchSize))
  }

  for (const batch of batches) {
    const result = await postJson('/api/events/batch', { events: batch }, (value) =>
      EventBatchResponseSchema.parse(value)
    )
    if (result.rejected.length > 0) {
      throw new Error(`Event batch contains rejected events: ${JSON.stringify(result.rejected)}`)
    }
    accepted += result.accepted.length
    duplicates += result.duplicates.length
  }
  expectEqual('Accepted events', accepted, events.length)
  expectEqual('Unexpected duplicates before retry', duplicates, 0)

  const retryBatch = batches[0]
  if (!retryBatch) throw new Error('At least one event batch is required')
  const retry = await postJson('/api/events/batch', { events: retryBatch }, (value) =>
    EventBatchResponseSchema.parse(value)
  )
  expectEqual('Retried batch accepted events', retry.accepted.length, 0)
  expectEqual('Retried batch duplicates', retry.duplicates.length, retryBatch.length)
  expectEqual('Retried batch rejected events', retry.rejected.length, 0)
  duplicates += retry.duplicates.length

  const afterAll = await fetchAnalytics()
  validateAnalyticsDelta({
    label: 'All traffic',
    before: beforeAll,
    after: afterAll,
    scenarios,
    customEvents: config.customEvents
  })

  for (const { campaign } of trafficCampaigns) {
    const before = beforeCampaigns.get(campaign)
    if (!before) throw new Error(`Missing baseline for ${campaign}`)
    const campaignScenarios = scenarios.filter(
      (scenario) => scenario.campaign.campaign === campaign
    )
    validateAnalyticsDelta({
      label: campaign,
      before,
      after: await fetchAnalytics(campaign),
      scenarios: campaignScenarios,
      customEvents: config.customEvents
    })
  }

  const resultRate = (expected.totals.resultReached / expected.totals.sessionsStarted) * 100
  const ctaCtr = (expected.totals.ctaClicked / expected.totals.resultReached) * 100
  console.log('Traffic generation completed and analytics checks passed')
  console.log(`Sessions: ${expected.totals.sessionsStarted} (A: 50, B: 50)`)
  console.log(`Results: ${expected.totals.resultReached} (${resultRate}%)`)
  console.log(`CTA clicks: ${expected.totals.ctaClicked} (${ctaCtr}% CTR)`)
  console.log(`Events accepted: ${accepted}; duplicate deliveries: ${duplicates}`)
  Object.entries(expected.events).forEach(([name, sessions]) =>
    console.log(`Custom event ${name}: ${sessions} unique sessions`)
  )
  console.log(`Batches: ${batches.length}; out-of-order sessions: 10; back sessions: 10`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
