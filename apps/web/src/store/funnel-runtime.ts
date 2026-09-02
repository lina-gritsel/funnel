import type { FunnelAnswer, FunnelConfig, FunnelVariantId } from '@funnel/contracts'
import {
  getStep,
  resolveNextStepId,
  resolveVariant,
  validateStepAnswer,
  type FunnelAnswers,
  type ResolvedFunnel
} from '@funnel/engine'
import { create } from 'zustand'

type SubmitResult = { success: true } | { success: false; error: string }

type FunnelRuntimeState = {
  funnel: ResolvedFunnel | null
  trail: string[]
  cursor: number
  answers: FunnelAnswers
  draft: FunnelAnswer | undefined
  error: string | null
  initialize: (config: FunnelConfig, variant: FunnelVariantId) => void
  setDraft: (value: FunnelAnswer) => void
  submitCurrent: () => SubmitResult
  goBack: () => void
  reset: () => void
}

function answersEqual(left: FunnelAnswer | undefined, right: FunnelAnswer | undefined) {
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => value === right[index])
  }

  return left === right
}

export const useFunnelRuntimeStore = create<FunnelRuntimeState>((set, get) => ({
  funnel: null,
  trail: [],
  cursor: 0,
  answers: {},
  draft: undefined,
  error: null,

  initialize(config, variant) {
    const funnel = resolveVariant(config, variant)
    set({
      funnel,
      trail: [funnel.entryStepId],
      cursor: 0,
      answers: {},
      draft: undefined,
      error: null
    })
  },

  setDraft(value) {
    set({ draft: value, error: null })
  },

  submitCurrent() {
    const state = get()
    const currentStepId = state.trail[state.cursor]

    if (!state.funnel || !currentStepId) {
      return { success: false, error: 'Воронка ещё не готова' }
    }

    const step = getStep(state.funnel, currentStepId)
    const validation = validateStepAnswer(step, state.draft)

    if (!validation.success) {
      set({ error: validation.error })
      return validation
    }

    const previousAnswer = state.answers[currentStepId]
    const answerChanged = !answersEqual(previousAnswer, validation.data)
    const answers = { ...state.answers }

    if (validation.data === undefined) {
      delete answers[currentStepId]
    } else {
      answers[currentStepId] = validation.data
    }

    if (answerChanged) {
      state.trail.slice(state.cursor + 1).forEach((stepId) => delete answers[stepId])
    }

    const nextStepId = resolveNextStepId(state.funnel, currentStepId, answers)
    if (!nextStepId) {
      set({ answers, error: null })
      return { success: true }
    }

    const trail = [...state.trail.slice(0, state.cursor + 1), nextStepId]
    set({
      trail,
      cursor: state.cursor + 1,
      answers,
      draft: answers[nextStepId],
      error: null
    })

    return { success: true }
  },

  goBack() {
    const state = get()
    if (state.cursor === 0) return

    const cursor = state.cursor - 1
    const stepId = state.trail[cursor]
    set({
      cursor,
      draft: stepId ? state.answers[stepId] : undefined,
      error: null
    })
  },

  reset() {
    const funnel = get().funnel
    if (!funnel) return

    set({
      trail: [funnel.entryStepId],
      cursor: 0,
      answers: {},
      draft: undefined,
      error: null
    })
  }
}))
