import { describe, expect, it } from 'vitest'

import { loadActiveFunnelConfig, parseFunnelConfig } from './funnel-config.js'

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
      'transition references unknown step missing-step'
    )
  })
})
