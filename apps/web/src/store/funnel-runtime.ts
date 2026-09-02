import type {
  FunnelAnswer,
  FunnelAnswers,
  FunnelSession,
  SessionBootstrapResponse
} from '@funnel/contracts'
import {
  getStep,
  resolveVariant,
  validateStepAnswer,
  type AnswerValidationResult,
  type ResolvedFunnel
} from '@funnel/engine'
import { create } from 'zustand'

type FunnelRuntimeState = {
  session: FunnelSession | null
  funnel: ResolvedFunnel | null
  trail: string[]
  cursor: number
  answers: FunnelAnswers
  draft: FunnelAnswer | undefined
  error: string | null
  hydrate: (data: SessionBootstrapResponse) => void
  applySession: (session: FunnelSession) => void
  setDraft: (value: FunnelAnswer) => void
  validateDraft: () => AnswerValidationResult
  setError: (message: string | null) => void
}

export const useFunnelRuntimeStore = create<FunnelRuntimeState>((set, get) => ({
  session: null,
  funnel: null,
  trail: [],
  cursor: 0,
  answers: {},
  draft: undefined,
  error: null,

  hydrate({ config, session }) {
    set({
      session,
      funnel: resolveVariant(config, session.variant),
      trail: session.trail,
      cursor: session.cursor,
      answers: session.answers,
      draft: session.answers[session.currentStepId],
      error: null
    })
  },

  applySession(session) {
    set({
      session,
      trail: session.trail,
      cursor: session.cursor,
      answers: session.answers,
      draft: session.answers[session.currentStepId],
      error: null
    })
  },

  setDraft(value) {
    set({ draft: value, error: null })
  },

  validateDraft() {
    const state = get()
    const currentStepId = state.trail[state.cursor]
    if (!state.funnel || !currentStepId) {
      return { success: false, error: 'Воронка ещё не готова' }
    }

    const result = validateStepAnswer(getStep(state.funnel, currentStepId), state.draft)
    if (!result.success) set({ error: result.error })
    return result
  },

  setError(message) {
    set({ error: message })
  }
}))
