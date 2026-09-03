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

const draftStoragePrefix = 'funnel-draft'

function draftStorageKey(sessionId: string, stepId: string) {
  return `${draftStoragePrefix}:${sessionId}:${stepId}`
}

function isFunnelAnswer(value: unknown): value is FunnelAnswer {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    (Array.isArray(value) && value.every((item) => typeof item === 'string'))
  )
}

function readDraft(sessionId: string, stepId: string): FunnelAnswer | undefined {
  if (typeof window === 'undefined') return undefined

  try {
    const source = window.sessionStorage.getItem(draftStorageKey(sessionId, stepId))
    if (source === null) return undefined
    const value: unknown = JSON.parse(source)
    return isFunnelAnswer(value) ? value : undefined
  } catch {
    return undefined
  }
}

function writeDraft(sessionId: string, stepId: string, value: FunnelAnswer) {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(draftStorageKey(sessionId, stepId), JSON.stringify(value))
}

function clearDraft(sessionId: string, stepId: string) {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(draftStorageKey(sessionId, stepId))
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
      draft: readDraft(session.id, session.currentStepId) ?? session.answers[session.currentStepId],
      error: null
    })
  },

  applySession(session) {
    const previousSession = get().session
    if (previousSession && previousSession.currentStepId !== session.currentStepId) {
      clearDraft(previousSession.id, previousSession.currentStepId)
    }

    set({
      session,
      trail: session.trail,
      cursor: session.cursor,
      answers: session.answers,
      draft: readDraft(session.id, session.currentStepId) ?? session.answers[session.currentStepId],
      error: null
    })
  },

  setDraft(value) {
    const session = get().session
    if (session) writeDraft(session.id, session.currentStepId, value)
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
