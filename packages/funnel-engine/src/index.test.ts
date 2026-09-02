import type { FunnelConfig } from '@funnel/contracts'
import { describe, expect, it } from 'vitest'

import {
  getPossibleRoutes,
  getProgress,
  resolveNextStepId,
  resolveVariant,
  validateStepAnswer
} from './index.js'

const config: FunnelConfig = {
  schemaVersion: 1,
  id: 'test-funnel',
  name: 'Test funnel',
  version: 1,
  status: 'active',
  createdAt: '2026-09-03T00:00:00.000Z',
  publishedAt: '2026-09-03T00:00:00.000Z',
  entryStepId: 'welcome',
  experiment: {
    id: 'order-test',
    hypothesis: 'Amount first performs better',
    primaryMetric: 'result_completion_rate',
    variants: {
      A: {
        name: 'A',
        description: 'Goal first',
        weight: 50,
        stepOverrides: {}
      },
      B: {
        name: 'B',
        description: 'Amount first',
        weight: 50,
        stepOverrides: {
          welcome: { next: { type: 'direct', stepId: 'amount' } },
          amount: { next: { type: 'direct', stepId: 'goal' } },
          goal: { next: { type: 'direct', stepId: 'experience' } }
        }
      }
    }
  },
  steps: [
    {
      id: 'welcome',
      type: 'info',
      title: 'Welcome',
      next: { type: 'direct', stepId: 'goal' }
    },
    {
      id: 'goal',
      type: 'single-select',
      title: 'Goal',
      options: [{ value: 'save', label: 'Save' }],
      validation: { required: true },
      next: { type: 'direct', stepId: 'amount' }
    },
    {
      id: 'amount',
      type: 'number',
      title: 'Amount',
      label: 'Amount',
      min: 10,
      validation: { required: true },
      next: { type: 'direct', stepId: 'experience' }
    },
    {
      id: 'experience',
      type: 'single-select',
      title: 'Experience',
      options: [
        { value: 'beginner', label: 'Beginner' },
        { value: 'experienced', label: 'Experienced' }
      ],
      validation: { required: true },
      next: {
        type: 'branch',
        rules: [
          {
            when: { stepId: 'experience', operator: 'equals', value: 'beginner' },
            stepId: 'education'
          }
        ],
        fallbackStepId: 'result'
      }
    },
    {
      id: 'education',
      type: 'info',
      title: 'Education',
      next: { type: 'direct', stepId: 'result' }
    },
    {
      id: 'result',
      type: 'result',
      title: 'Result',
      cta: { label: 'Continue', href: '/' }
    }
  ]
}

describe('funnel engine', () => {
  it('applies variant step order', () => {
    const variantA = resolveVariant(config, 'A')
    const variantB = resolveVariant(config, 'B')

    expect(resolveNextStepId(variantA, 'welcome', {})).toBe('goal')
    expect(resolveNextStepId(variantB, 'welcome', {})).toBe('amount')
  })

  it('resolves both conditional routes', () => {
    const funnel = resolveVariant(config, 'A')

    expect(resolveNextStepId(funnel, 'experience', { experience: 'beginner' })).toBe('education')
    expect(resolveNextStepId(funnel, 'experience', { experience: 'experienced' })).toBe('result')
  })

  it('recalculates total progress after the branch answer', () => {
    const funnel = resolveVariant(config, 'A')

    expect(getPossibleRoutes(funnel, {}).map((route) => route.length)).toEqual([6, 5])
    expect(getProgress(funnel, {}, 3)).toEqual({ current: 4, total: 6 })
    expect(getProgress(funnel, { experience: 'experienced' }, 3)).toEqual({
      current: 4,
      total: 5
    })
  })

  it('validates configured answer constraints', () => {
    const funnel = resolveVariant(config, 'A')
    const goal = funnel.steps.find((step) => step.id === 'goal')
    const amount = funnel.steps.find((step) => step.id === 'amount')

    if (!goal || !amount) throw new Error('Test steps are missing')

    expect(validateStepAnswer(goal, '')).toMatchObject({ success: false })
    expect(validateStepAnswer(goal, 'save')).toEqual({ success: true, data: 'save' })
    expect(validateStepAnswer(amount, '5')).toMatchObject({ success: false })
    expect(validateStepAnswer(amount, '100')).toEqual({ success: true, data: 100 })
  })
})
