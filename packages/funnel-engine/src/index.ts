import type {
  FunnelAnswer,
  FunnelAnswers,
  FunnelCondition,
  FunnelConfig,
  FunnelCustomEvent,
  FunnelStepConfig,
  FunnelStepOverride,
  FunnelTransition,
  FunnelVariantId
} from '@funnel/contracts'
import { z } from 'zod'

export type ResolvedFunnel = {
  id: string
  name: string
  version: number
  variant: FunnelVariantId
  entryStepId: string
  customEvents: FunnelCustomEvent[]
  steps: FunnelStepConfig[]
}

export type FunnelProgress = {
  current: number
  total: number
}

export type AnswerValidationResult =
  { success: true; data?: FunnelAnswer } | { success: false; error: string }

export type FunnelRuntimeSnapshot = {
  trail: string[]
  cursor: number
  answers: FunnelAnswers
}

export type AdvanceRuntimeResult =
  { success: true; snapshot: FunnelRuntimeSnapshot } | { success: false; error: string }

function applyOverride(step: FunnelStepConfig, override?: FunnelStepOverride): FunnelStepConfig {
  if (!override) return step

  if (step.type === 'result') {
    return {
      ...step,
      ...(override.title ? { title: override.title } : {}),
      ...(override.description ? { description: override.description } : {}),
      cta: {
        ...step.cta,
        ...(override.ctaLabel ? { label: override.ctaLabel } : {})
      }
    }
  }

  return {
    ...step,
    ...(override.title ? { title: override.title } : {}),
    ...(override.description ? { description: override.description } : {}),
    ...(override.next ? { next: override.next } : {})
  } as FunnelStepConfig
}

export function resolveVariant(config: FunnelConfig, variantId: FunnelVariantId): ResolvedFunnel {
  const variant = config.experiment.variants[variantId]
  const steps = config.steps
    .filter((step) => !variant.stepOverrides[step.id]?.hidden)
    .map((step) => applyOverride(step, variant.stepOverrides[step.id]))

  return {
    id: config.id,
    name: config.name,
    version: config.version,
    variant: variantId,
    entryStepId: config.entryStepId,
    customEvents: config.customEvents,
    steps
  }
}

export function getStep(funnel: ResolvedFunnel, stepId: string): FunnelStepConfig {
  const step = funnel.steps.find((candidate) => candidate.id === stepId)
  if (!step) throw new Error(`Unknown funnel step: ${stepId}`)
  return step
}

function conditionMatches(condition: FunnelCondition, answers: FunnelAnswers): boolean {
  const answer = answers[condition.stepId]
  if (answer === undefined) return false

  switch (condition.operator) {
    case 'equals':
      return answer === condition.value
    case 'includes':
      return Array.isArray(answer) && answer.includes(String(condition.value))
    case 'greater-than':
      return typeof answer === 'number' && answer > Number(condition.value)
    case 'less-than':
      return typeof answer === 'number' && answer < Number(condition.value)
  }
}

function transitionTargets(transition: FunnelTransition, answers: FunnelAnswers): string[] {
  if (transition.type === 'direct') return [transition.stepId]

  const unresolvedRules = transition.rules.filter((rule) => answers[rule.when.stepId] === undefined)
  const matchedRule = transition.rules.find(
    (rule) => answers[rule.when.stepId] !== undefined && conditionMatches(rule.when, answers)
  )

  if (matchedRule) return [matchedRule.stepId]
  if (unresolvedRules.length === 0) return [transition.fallbackStepId]

  return [...new Set([...unresolvedRules.map((rule) => rule.stepId), transition.fallbackStepId])]
}

export function resolveNextStepId(
  funnel: ResolvedFunnel,
  stepId: string,
  answers: FunnelAnswers
): string | undefined {
  const step = getStep(funnel, stepId)
  if (!step.next) return undefined

  return transitionTargets(step.next, answers)[0]
}

export function getPossibleRoutes(funnel: ResolvedFunnel, answers: FunnelAnswers): string[][] {
  const routes: string[][] = []

  function visit(stepId: string, path: string[]) {
    if (path.includes(stepId)) throw new Error(`Funnel contains a cycle at step ${stepId}`)

    const step = getStep(funnel, stepId)
    const nextPath = [...path, stepId]

    if (!step.next) {
      routes.push(nextPath)
      return
    }

    transitionTargets(step.next, answers).forEach((targetId) => visit(targetId, nextPath))
  }

  visit(funnel.entryStepId, [])
  return routes
}

export function getProgress(
  funnel: ResolvedFunnel,
  answers: FunnelAnswers,
  cursor: number
): FunnelProgress {
  const routes = getPossibleRoutes(funnel, answers)
  const total = Math.max(...routes.map((route) => route.length), cursor + 1)

  return {
    current: Math.min(cursor + 1, total),
    total
  }
}

function optionalSchema<T extends z.ZodType>(schema: T, required: boolean): T | z.ZodOptional<T> {
  return required ? schema : schema.optional()
}

export function validateStepAnswer(step: FunnelStepConfig, value: unknown): AnswerValidationResult {
  if (step.type === 'info' || step.type === 'result') return { success: true }

  let schema: z.ZodType

  if (step.type === 'single-select') {
    const allowedValues = new Set(step.options.map((option) => option.value))
    schema = optionalSchema(
      z
        .string()
        .min(1, 'Выберите один вариант')
        .refine((answer) => allowedValues.has(answer), 'Выберите доступный вариант'),
      step.validation.required
    )
  } else if (step.type === 'multi-select') {
    const allowedValues = new Set(step.options.map((option) => option.value))
    const minimum = step.validation.minSelections ?? (step.validation.required ? 1 : 0)
    let multiSchema = z.array(z.string()).min(minimum, `Выберите минимум ${minimum}`)

    if (step.validation.maxSelections !== undefined) {
      multiSchema = multiSchema.max(
        step.validation.maxSelections,
        `Можно выбрать не больше ${step.validation.maxSelections}`
      )
    }

    schema = multiSchema.refine(
      (answers) => answers.every((answer) => allowedValues.has(answer)),
      'Один из выбранных вариантов недоступен'
    )
  } else {
    let numberSchema = z.number({ error: 'Введите число' })
    if (step.min !== undefined) {
      numberSchema = numberSchema.min(step.min, `Минимальное значение — ${step.min}`)
    }
    if (step.max !== undefined) {
      numberSchema = numberSchema.max(step.max, `Максимальное значение — ${step.max}`)
    }

    schema = optionalSchema(numberSchema, step.validation.required)
    value = value === '' || value === undefined ? undefined : Number(value)
  }

  const result = schema.safeParse(value)
  if (!result.success) {
    return {
      success: false,
      error: result.error.issues[0]?.message ?? 'Проверьте введённое значение'
    }
  }

  return result.data === undefined
    ? { success: true }
    : { success: true, data: result.data as FunnelAnswer }
}

function answersEqual(left: FunnelAnswer | undefined, right: FunnelAnswer | undefined) {
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => value === right[index])
  }

  return left === right
}

export function advanceRuntime(
  funnel: ResolvedFunnel,
  snapshot: FunnelRuntimeSnapshot,
  value: unknown
): AdvanceRuntimeResult {
  const currentStepId = snapshot.trail[snapshot.cursor]
  if (!currentStepId) return { success: false, error: 'Текущий шаг не найден' }

  const validation = validateStepAnswer(getStep(funnel, currentStepId), value)
  if (!validation.success) return validation

  const answers = { ...snapshot.answers }
  const previousAnswer = answers[currentStepId]

  if (validation.data === undefined) delete answers[currentStepId]
  else answers[currentStepId] = validation.data

  if (!answersEqual(previousAnswer, validation.data)) {
    snapshot.trail.slice(snapshot.cursor + 1).forEach((stepId) => delete answers[stepId])
  }

  const nextStepId = resolveNextStepId(funnel, currentStepId, answers)
  if (!nextStepId) {
    return { success: true, snapshot: { ...snapshot, answers } }
  }

  return {
    success: true,
    snapshot: {
      trail: [...snapshot.trail.slice(0, snapshot.cursor + 1), nextStepId],
      cursor: snapshot.cursor + 1,
      answers
    }
  }
}

export function moveRuntimeBack(snapshot: FunnelRuntimeSnapshot): FunnelRuntimeSnapshot {
  return {
    ...snapshot,
    cursor: Math.max(0, snapshot.cursor - 1)
  }
}
