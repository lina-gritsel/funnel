import type { FunnelCustomEvent, FunnelVariantId } from '@funnel/contracts'

export const trafficCampaigns = [
  { campaign: 'synthetic-search', source: 'google', medium: 'cpc' },
  { campaign: 'synthetic-social', source: 'instagram', medium: 'paid-social' },
  { campaign: 'synthetic-partner', source: 'partner-network', medium: 'referral' },
  { campaign: 'synthetic-email', source: 'newsletter', medium: 'email' },
  { campaign: 'synthetic-display', source: 'display-network', medium: 'display' }
] as const

export type TrafficStepId =
  | 'welcome'
  | 'goal'
  | 'amount'
  | 'priorities'
  | 'horizon'
  | 'liquidity'
  | 'experience'
  | 'education'
  | 'result'

export type TrafficScenario = {
  index: number
  version: number
  campaign: (typeof trafficCampaigns)[number]
  variant: FunnelVariantId
  branch: 'beginner' | 'experienced'
  horizon: 'short' | 'long'
  dropAt: TrafficStepId | null
  clickCta: boolean
  useBack: boolean
  repeatView: boolean
  deliverOutOfOrder: boolean
}

export type TrafficMetricCounts = {
  sessionsStarted: number
  resultReached: number
  ctaClicked: number
}

export type TrafficStepCounts = {
  viewed: number
  completed: number
}

export type TrafficSummary = {
  totals: TrafficMetricCounts
  variants: Record<FunnelVariantId, TrafficMetricCounts>
  campaigns: Record<string, TrafficMetricCounts>
  steps: Partial<Record<TrafficStepId, TrafficStepCounts>>
  events: Record<string, number>
}

const variants: FunnelVariantId[] = ['A', 'B']

function emptyMetrics(): TrafficMetricCounts {
  return { sessionsStarted: 0, resultReached: 0, ctaClicked: 0 }
}

export function getScenarioRoute(scenario: TrafficScenario): TrafficStepId[] {
  const questions: TrafficStepId[] =
    scenario.variant === 'A' ? ['goal', 'amount'] : ['amount', 'goal']

  return [
    'welcome',
    ...questions,
    'priorities',
    ...(scenario.version >= 2
      ? (['horizon', ...(scenario.horizon === 'short' ? ['liquidity'] : [])] as TrafficStepId[])
      : []),
    'experience',
    ...(scenario.branch === 'beginner' && (scenario.version === 1 || scenario.variant === 'A')
      ? (['education'] as const)
      : []),
    'result'
  ]
}

export function createTrafficPlan(version = 1): TrafficScenario[] {
  const scenarios: TrafficScenario[] = []

  trafficCampaigns.forEach((campaign, campaignIndex) => {
    variants.forEach((variant, variantIndex) => {
      const firstQuestion: TrafficStepId = variant === 'A' ? 'goal' : 'amount'
      const secondQuestion: TrafficStepId = variant === 'A' ? 'amount' : 'goal'

      for (let localIndex = 0; localIndex < 10; localIndex += 1) {
        const isComplete = localIndex < 5
        const branch =
          localIndex === 9 && campaignIndex % 2 === 1
            ? 'beginner'
            : (localIndex + campaignIndex + variantIndex) % 2 === 0
              ? 'beginner'
              : 'experienced'
        const horizon = (localIndex + campaignIndex + variantIndex) % 2 === 0 ? 'short' : 'long'
        let dropAt: TrafficStepId | null = null

        if (!isComplete) {
          if (version === 1) {
            const dropTargets: TrafficStepId[] = [
              'welcome',
              firstQuestion,
              'priorities',
              'experience',
              campaignIndex % 2 === 0 ? secondQuestion : 'education'
            ]
            dropAt = dropTargets[localIndex - 5] ?? null
          } else {
            const draftScenario: TrafficScenario = {
              index: scenarios.length,
              version,
              campaign,
              variant,
              branch,
              horizon,
              dropAt: null,
              clickCta: false,
              useBack: false,
              repeatView: false,
              deliverOutOfOrder: false
            }
            const route = getScenarioRoute(draftScenario)
            const lateDrop = route.includes('liquidity')
              ? 'liquidity'
              : route.includes('education')
                ? 'education'
                : 'experience'
            const dropTargets: TrafficStepId[] = [
              'welcome',
              firstQuestion,
              'priorities',
              'horizon',
              lateDrop
            ]
            dropAt = dropTargets[localIndex - 5] ?? null
          }
        }

        scenarios.push({
          index: scenarios.length,
          version,
          campaign,
          variant,
          branch,
          horizon,
          dropAt,
          clickCta: isComplete && localIndex < 3,
          useBack: isComplete && localIndex === 0,
          repeatView: localIndex === 1,
          deliverOutOfOrder: localIndex === 2
        })
      }
    })
  })

  return scenarios
}

function incrementMetrics(metrics: TrafficMetricCounts, scenario: TrafficScenario) {
  metrics.sessionsStarted += 1
  if (scenario.dropAt === null) metrics.resultReached += 1
  if (scenario.clickCta) metrics.ctaClicked += 1
}

export function summarizeTrafficPlan(
  scenarios: TrafficScenario[],
  customEvents: FunnelCustomEvent[] = []
): TrafficSummary {
  const summary: TrafficSummary = {
    totals: emptyMetrics(),
    variants: { A: emptyMetrics(), B: emptyMetrics() },
    campaigns: Object.fromEntries(
      trafficCampaigns.map(({ campaign }) => [campaign, emptyMetrics()])
    ),
    steps: {},
    events: Object.fromEntries(customEvents.map((event) => [event.name, 0]))
  }

  scenarios.forEach((scenario) => {
    incrementMetrics(summary.totals, scenario)
    incrementMetrics(summary.variants[scenario.variant], scenario)
    const campaignMetrics = summary.campaigns[scenario.campaign.campaign]
    if (campaignMetrics) incrementMetrics(campaignMetrics, scenario)

    for (const stepId of getScenarioRoute(scenario)) {
      const step = (summary.steps[stepId] ??= { viewed: 0, completed: 0 })
      step.viewed += 1
      if (stepId === scenario.dropAt) break

      if (stepId === 'result') {
        if (scenario.clickCta) step.completed += 1
        break
      }

      step.completed += 1
      customEvents
        .filter((event) => event.trigger === 'step_completed' && event.stepId === stepId)
        .forEach((event) => {
          summary.events[event.name] = (summary.events[event.name] ?? 0) + 1
        })
    }
  })

  return summary
}
