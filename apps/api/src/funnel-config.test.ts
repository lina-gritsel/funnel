import { describe, expect, it } from 'vitest'
import { resolveVariant } from '@funnel/engine'

import { loadActiveFunnelConfig, loadFunnelConfig, parseFunnelConfig } from './funnel-config.js'

describe('funnel config', () => {
  it('loads the active config with six or more screens and a branch', async () => {
    const config = await loadActiveFunnelConfig()

    expect(config.version).toBe(1)
    expect(config.steps.length).toBeGreaterThanOrEqual(6)
    expect(config.steps.some((step) => step.next?.type === 'branch')).toBe(true)
    expect(Object.keys(config.experiment.variants)).toEqual(['A', 'B'])
  })

  it('rejects a transition to an unknown screen', async () => {
    const config = structuredClone(await loadActiveFunnelConfig())
    const firstStep = config.steps[0]

    if (!firstStep) throw new Error('Fixture must contain a first step')
    firstStep.next = { type: 'direct', stepId: 'missing-step' }

    expect(() => parseFunnelConfig(config)).toThrow(
      'Transition references unknown step missing-step'
    )
  })

  it('loads the second iteration with a new branch, hidden B screen and custom event', () => {
    const config = loadFunnelConfig(2)
    const variantA = resolveVariant(config, 'A')
    const variantB = resolveVariant(config, 'B')

    expect(config.customEvents).toEqual([
      {
        name: 'investment_horizon_selected',
        trigger: 'step_completed',
        stepId: 'horizon'
      }
    ])
    expect(config.steps.find((step) => step.id === 'horizon')?.next?.type).toBe('branch')
    expect(variantA.steps.some((step) => step.id === 'education')).toBe(true)
    expect(variantB.steps.some((step) => step.id === 'education')).toBe(false)
  })
})
