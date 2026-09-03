import type { FunnelVariantId } from '@funnel/contracts'

export const trafficCampaigns = [
  { campaign: 'synthetic-search', source: 'google', medium: 'cpc' },
  { campaign: 'synthetic-social', source: 'instagram', medium: 'paid-social' },
  { campaign: 'synthetic-partner', source: 'partner-network', medium: 'referral' },
  { campaign: 'synthetic-email', source: 'newsletter', medium: 'email' },
  { campaign: 'synthetic-display', source: 'display-network', medium: 'display' }
] as const

export type TrafficStepId =
  'welcome' | 'goal' | 'amount' | 'priorities' | 'experience' | 'education' | 'result'

export type TrafficScenario = {
  index: number
  campaign: (typeof trafficCampaigns)[number]
  variant: FunnelVariantId
  branch: 'beginner' | 'experienced'
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
  steps: Record<TrafficStepId, TrafficStepCounts>
}

const variants: FunnelVariantId[] = ['A', 'B']

function emptyMetrics(): TrafficMetricCounts {
  return { sessionsStarted: 0, resultReached: 0, ctaClicked: 0 }
}

function emptyStepCounts(): Record<TrafficStepId, TrafficStepCounts> {
  return {
    welcome: { viewed: 0, completed: 0 },
    goal: { viewed: 0, completed: 0 },
    amount: { viewed: 0, completed: 0 },
    priorities: { viewed: 0, completed: 0 },
    experience: { viewed: 0, completed: 0 },
    education: { viewed: 0, completed: 0 },
    result: { viewed: 0, completed: 0 }
  }
}

export function getScenarioRoute(scenario: TrafficScenario): TrafficStepId[] {
  const questions: TrafficStepId[] =
    scenario.variant === 'A' ? ['goal', 'amount'] : ['amount', 'goal']

  return [
    'welcome',
    ...questions,
    'priorities',
    'experience',
    ...(scenario.branch === 'beginner' ? (['education'] as const) : []),
    'result'
  ]
}

export function createTrafficPlan(): TrafficScenario[] {
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
        let dropAt: TrafficStepId | null = null

        if (!isComplete) {
          const dropTargets: TrafficStepId[] = [
            'welcome',
            firstQuestion,
            'priorities',
            'experience',
            campaignIndex % 2 === 0 ? secondQuestion : 'education'
          ]
          dropAt = dropTargets[localIndex - 5] ?? null
        }

        scenarios.push({
          index: scenarios.length,
          campaign,
          variant,
          branch,
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

export function summarizeTrafficPlan(scenarios: TrafficScenario[]): TrafficSummary {
  const summary: TrafficSummary = {
    totals: emptyMetrics(),
    variants: { A: emptyMetrics(), B: emptyMetrics() },
    campaigns: Object.fromEntries(
      trafficCampaigns.map(({ campaign }) => [campaign, emptyMetrics()])
    ),
    steps: emptyStepCounts()
  }

  scenarios.forEach((scenario) => {
    incrementMetrics(summary.totals, scenario)
    incrementMetrics(summary.variants[scenario.variant], scenario)
    const campaignMetrics = summary.campaigns[scenario.campaign.campaign]
    if (campaignMetrics) incrementMetrics(campaignMetrics, scenario)

    for (const stepId of getScenarioRoute(scenario)) {
      summary.steps[stepId].viewed += 1
      if (stepId === scenario.dropAt) break

      if (stepId === 'result') {
        if (scenario.clickCta) summary.steps.result.completed += 1
        break
      }

      summary.steps[stepId].completed += 1
    }
  })

  return summary
}
