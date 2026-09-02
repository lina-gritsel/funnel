import { FunnelConfigSchema, type FunnelSession } from '@funnel/contracts'
import { beforeEach, describe, expect, it } from 'vitest'

import configJson from '../../../../configs/funnel-v1.json'
import { useFunnelRuntimeStore } from './funnel-runtime'

const config = FunnelConfigSchema.parse(configJson)
const timestamp = '2026-09-03T10:00:00.000Z'

function session(overrides: Partial<FunnelSession> = {}): FunnelSession {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    funnelId: config.id,
    version: config.version,
    variant: 'A',
    currentStepId: 'welcome',
    trail: ['welcome'],
    cursor: 0,
    answers: {},
    utm: {},
    createdAt: timestamp,
    updatedAt: timestamp,
    completedAt: null,
    ...overrides
  }
}

beforeEach(() => {
  useFunnelRuntimeStore.getState().hydrate({ config, session: session() })
})

describe('funnel runtime store', () => {
  it('hydrates the saved server step and answer', () => {
    useFunnelRuntimeStore.getState().hydrate({
      config,
      session: session({
        currentStepId: 'amount',
        trail: ['welcome', 'goal', 'amount'],
        cursor: 2,
        answers: { goal: 'invest', amount: 500000 }
      })
    })

    const state = useFunnelRuntimeStore.getState()
    expect(state.session?.version).toBe(1)
    expect(state.funnel?.variant).toBe('A')
    expect(state.draft).toBe(500000)
  })

  it('applies a server-confirmed back navigation without losing answers', () => {
    useFunnelRuntimeStore.getState().applySession(
      session({
        currentStepId: 'goal',
        trail: ['welcome', 'goal', 'amount'],
        cursor: 1,
        answers: { goal: 'invest', amount: 500000 }
      })
    )

    const state = useFunnelRuntimeStore.getState()
    expect(state.draft).toBe('invest')
    expect(state.answers.amount).toBe(500000)
  })

  it('validates the draft against the current configured step', () => {
    useFunnelRuntimeStore.getState().applySession(
      session({
        currentStepId: 'amount',
        trail: ['welcome', 'goal', 'amount'],
        cursor: 2,
        answers: { goal: 'invest' }
      })
    )

    useFunnelRuntimeStore.getState().setDraft(100)
    expect(useFunnelRuntimeStore.getState().validateDraft()).toMatchObject({ success: false })

    useFunnelRuntimeStore.getState().setDraft(500000)
    expect(useFunnelRuntimeStore.getState().validateDraft()).toEqual({
      success: true,
      data: 500000
    })
  })
})
