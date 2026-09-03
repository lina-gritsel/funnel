import { describe, expect, it } from 'vitest'

import {
  createTrafficPlan,
  getScenarioRoute,
  summarizeTrafficPlan,
  trafficCampaigns
} from './traffic-plan.js'

describe('traffic plan', () => {
  it('creates a balanced set of exactly 100 sessions', () => {
    const plan = createTrafficPlan()
    const summary = summarizeTrafficPlan(plan)

    expect(plan).toHaveLength(100)
    expect(summary.totals).toEqual({
      sessionsStarted: 100,
      resultReached: 50,
      ctaClicked: 30
    })
    expect(summary.variants).toEqual({
      A: { sessionsStarted: 50, resultReached: 25, ctaClicked: 15 },
      B: { sessionsStarted: 50, resultReached: 25, ctaClicked: 15 }
    })
    trafficCampaigns.forEach(({ campaign }) => {
      expect(summary.campaigns[campaign]).toEqual({
        sessionsStarted: 20,
        resultReached: 10,
        ctaClicked: 6
      })
    })
  })

  it('covers branches, dropoffs and delivery edge cases', () => {
    const plan = createTrafficPlan()

    expect(new Set(plan.map(({ branch }) => branch))).toEqual(new Set(['beginner', 'experienced']))
    expect(new Set(plan.map(({ dropAt }) => dropAt).filter(Boolean))).toEqual(
      new Set(['welcome', 'goal', 'amount', 'priorities', 'experience', 'education'])
    )
    expect(plan.filter(({ useBack }) => useBack)).toHaveLength(10)
    expect(plan.filter(({ repeatView }) => repeatView)).toHaveLength(10)
    expect(plan.filter(({ deliverOutOfOrder }) => deliverOutOfOrder)).toHaveLength(10)
  })

  it('uses the variant-specific question order and both result branches', () => {
    const plan = createTrafficPlan()
    const variantA = plan.find(({ variant, dropAt }) => variant === 'A' && dropAt === null)
    const variantB = plan.find(({ variant, dropAt }) => variant === 'B' && dropAt === null)

    if (!variantA || !variantB) throw new Error('Complete scenarios are required')

    expect(getScenarioRoute(variantA).slice(0, 3)).toEqual(['welcome', 'goal', 'amount'])
    expect(getScenarioRoute(variantB).slice(0, 3)).toEqual(['welcome', 'amount', 'goal'])
    expect(plan.some((scenario) => getScenarioRoute(scenario).includes('education'))).toBe(true)
    expect(plan.some((scenario) => !getScenarioRoute(scenario).includes('education'))).toBe(true)
  })
})
