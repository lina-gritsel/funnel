import { z } from 'zod'

const NonEmptyStringSchema = z.string().trim().min(1)

export const FunnelVariantIdSchema = z.enum(['A', 'B'])

export const FunnelConditionSchema = z.object({
  stepId: NonEmptyStringSchema,
  operator: z.enum(['equals', 'includes', 'greater-than', 'less-than']),
  value: z.union([z.string(), z.number()])
})

export const DirectTransitionSchema = z.object({
  type: z.literal('direct'),
  stepId: NonEmptyStringSchema
})

export const BranchTransitionSchema = z.object({
  type: z.literal('branch'),
  rules: z
    .array(
      z.object({
        when: FunnelConditionSchema,
        stepId: NonEmptyStringSchema
      })
    )
    .min(1),
  fallbackStepId: NonEmptyStringSchema
})

export const FunnelTransitionSchema = z.discriminatedUnion('type', [
  DirectTransitionSchema,
  BranchTransitionSchema
])

const SelectOptionSchema = z.object({
  value: NonEmptyStringSchema,
  label: NonEmptyStringSchema,
  description: NonEmptyStringSchema.optional()
})

const StepCopySchema = {
  id: NonEmptyStringSchema,
  title: NonEmptyStringSchema,
  description: NonEmptyStringSchema.optional()
}

export const InfoStepConfigSchema = z.object({
  ...StepCopySchema,
  type: z.literal('info'),
  next: FunnelTransitionSchema
})

export const SingleSelectStepConfigSchema = z.object({
  ...StepCopySchema,
  type: z.literal('single-select'),
  options: z.array(SelectOptionSchema).min(1),
  validation: z.object({
    required: z.boolean()
  }),
  next: FunnelTransitionSchema
})

export const MultiSelectStepConfigSchema = z.object({
  ...StepCopySchema,
  type: z.literal('multi-select'),
  options: z.array(SelectOptionSchema).min(1),
  validation: z
    .object({
      required: z.boolean(),
      minSelections: z.number().int().min(0).optional(),
      maxSelections: z.number().int().positive().optional()
    })
    .refine(
      (validation) =>
        validation.minSelections === undefined ||
        validation.maxSelections === undefined ||
        validation.minSelections <= validation.maxSelections,
      { message: 'minSelections cannot exceed maxSelections' }
    ),
  next: FunnelTransitionSchema
})

export const NumberStepConfigSchema = z
  .object({
    ...StepCopySchema,
    type: z.literal('number'),
    label: NonEmptyStringSchema,
    min: z.number().optional(),
    max: z.number().optional(),
    suffix: NonEmptyStringSchema.optional(),
    validation: z.object({
      required: z.boolean()
    }),
    next: FunnelTransitionSchema
  })
  .refine((step) => step.min === undefined || step.max === undefined || step.min <= step.max, {
    message: 'min cannot exceed max',
    path: ['min']
  })

export const ResultStepConfigSchema = z.object({
  ...StepCopySchema,
  type: z.literal('result'),
  next: z.never().optional(),
  cta: z.object({
    label: NonEmptyStringSchema,
    href: NonEmptyStringSchema
  })
})

export const FunnelStepConfigSchema = z.discriminatedUnion('type', [
  InfoStepConfigSchema,
  SingleSelectStepConfigSchema,
  MultiSelectStepConfigSchema,
  NumberStepConfigSchema,
  ResultStepConfigSchema
])

export const FunnelStepOverrideSchema = z.object({
  title: NonEmptyStringSchema.optional(),
  description: NonEmptyStringSchema.optional(),
  next: FunnelTransitionSchema.optional(),
  ctaLabel: NonEmptyStringSchema.optional(),
  hidden: z.boolean().optional()
})

export const FunnelVariantConfigSchema = z.object({
  name: NonEmptyStringSchema,
  description: NonEmptyStringSchema,
  weight: z.number().positive(),
  stepOverrides: z.record(z.string(), FunnelStepOverrideSchema)
})

export const FunnelCustomEventSchema = z.object({
  name: NonEmptyStringSchema,
  trigger: z.literal('step_completed'),
  stepId: NonEmptyStringSchema
})

const FunnelConfigBaseSchema = z.object({
  schemaVersion: z.literal(1),
  id: NonEmptyStringSchema,
  name: NonEmptyStringSchema,
  version: z.number().int().positive(),
  status: z.enum(['draft', 'active', 'archived']),
  createdAt: z.iso.datetime(),
  publishedAt: z.iso.datetime().optional(),
  entryStepId: NonEmptyStringSchema,
  experiment: z.object({
    id: NonEmptyStringSchema,
    hypothesis: NonEmptyStringSchema,
    primaryMetric: NonEmptyStringSchema,
    variants: z.object({
      A: FunnelVariantConfigSchema,
      B: FunnelVariantConfigSchema
    })
  }),
  customEvents: z.array(FunnelCustomEventSchema).default([]),
  steps: z.array(FunnelStepConfigSchema).min(6)
})

function transitionTargets(transition: FunnelTransition | undefined): string[] {
  if (!transition) return []
  if (transition.type === 'direct') return [transition.stepId]

  return [...transition.rules.map((rule) => rule.stepId), transition.fallbackStepId]
}

export const FunnelConfigSchema = FunnelConfigBaseSchema.superRefine((config, context) => {
  const stepIds = config.steps.map((step) => step.id)
  const uniqueStepIds = new Set(stepIds)

  if (uniqueStepIds.size !== stepIds.length) {
    context.addIssue({
      code: 'custom',
      path: ['steps'],
      message: 'Step ids must be unique'
    })
  }

  if (!uniqueStepIds.has(config.entryStepId)) {
    context.addIssue({
      code: 'custom',
      path: ['entryStepId'],
      message: 'Entry step must reference an existing step'
    })
  }

  if (!config.steps.some((step) => step.type === 'result')) {
    context.addIssue({
      code: 'custom',
      path: ['steps'],
      message: 'Config must contain a result step'
    })
  }

  if (!config.steps.some((step) => step.next?.type === 'branch')) {
    context.addIssue({
      code: 'custom',
      path: ['steps'],
      message: 'Config must contain at least one branch'
    })
  }

  const customEventNames = config.customEvents.map((event) => event.name)
  if (new Set(customEventNames).size !== customEventNames.length) {
    context.addIssue({
      code: 'custom',
      path: ['customEvents'],
      message: 'Custom event names must be unique'
    })
  }

  config.customEvents.forEach((event, eventIndex) => {
    if (!uniqueStepIds.has(event.stepId)) {
      context.addIssue({
        code: 'custom',
        path: ['customEvents', eventIndex, 'stepId'],
        message: `Custom event references unknown step ${event.stepId}`
      })
    }
    if (FunnelEventNameSchema.safeParse(event.name).success) {
      context.addIssue({
        code: 'custom',
        path: ['customEvents', eventIndex, 'name'],
        message: `Custom event cannot reuse reserved name ${event.name}`
      })
    }
  })

  const weights = config.experiment.variants.A.weight + config.experiment.variants.B.weight
  if (weights !== 100) {
    context.addIssue({
      code: 'custom',
      path: ['experiment', 'variants'],
      message: 'Variant weights must add up to 100'
    })
  }

  config.steps.forEach((step, stepIndex) => {
    transitionTargets(step.next).forEach((targetId) => {
      if (!uniqueStepIds.has(targetId)) {
        context.addIssue({
          code: 'custom',
          path: ['steps', stepIndex, 'next'],
          message: `Transition references unknown step ${targetId}`
        })
      }
    })

    if (step.next?.type === 'branch') {
      step.next.rules.forEach((rule, ruleIndex) => {
        if (!uniqueStepIds.has(rule.when.stepId)) {
          context.addIssue({
            code: 'custom',
            path: ['steps', stepIndex, 'next', 'rules', ruleIndex, 'when', 'stepId'],
            message: `Condition references unknown step ${rule.when.stepId}`
          })
        }
      })
    }
  })

  const stepsById = new Map(config.steps.map((step) => [step.id, step]))
  const variantIds: FunnelVariantId[] = ['A', 'B']

  variantIds.forEach((variantId) => {
    const variant = config.experiment.variants[variantId]

    Object.entries(variant.stepOverrides).forEach(([stepId, override]) => {
      if (!uniqueStepIds.has(stepId)) {
        context.addIssue({
          code: 'custom',
          path: ['experiment', 'variants', variantId, 'stepOverrides', stepId],
          message: `Variant ${variantId} overrides unknown step ${stepId}`
        })
      }

      transitionTargets(override.next).forEach((targetId) => {
        if (!uniqueStepIds.has(targetId)) {
          context.addIssue({
            code: 'custom',
            path: ['experiment', 'variants', variantId, 'stepOverrides', stepId, 'next'],
            message: `Variant ${variantId} transition references unknown step ${targetId}`
          })
        }
      })
    })

    const visited = new Set<string>()
    const queue = [config.entryStepId]

    while (queue.length > 0) {
      const stepId = queue.shift()
      if (!stepId || visited.has(stepId)) continue

      const step = stepsById.get(stepId)
      if (!step || variant.stepOverrides[stepId]?.hidden) continue

      visited.add(stepId)
      const next = variant.stepOverrides[stepId]?.next ?? step.next

      transitionTargets(next).forEach((targetId) => {
        if (variant.stepOverrides[targetId]?.hidden) {
          context.addIssue({
            code: 'custom',
            path: ['experiment', 'variants', variantId, 'stepOverrides'],
            message: `Variant ${variantId} transitions to hidden step ${targetId}`
          })
          return
        }
        queue.push(targetId)
      })
    }

    const unreachable = config.steps
      .filter((step) => !variant.stepOverrides[step.id]?.hidden && !visited.has(step.id))
      .map((step) => step.id)

    if (unreachable.length > 0) {
      context.addIssue({
        code: 'custom',
        path: ['experiment', 'variants', variantId],
        message: `Variant ${variantId} has unreachable steps: ${unreachable.join(', ')}`
      })
    }

    const reachesResult = config.steps.some(
      (step) => step.type === 'result' && visited.has(step.id)
    )
    if (!reachesResult) {
      context.addIssue({
        code: 'custom',
        path: ['experiment', 'variants', variantId],
        message: `Variant ${variantId} cannot reach a result step`
      })
    }

    const visitState = new Map<string, 'visiting' | 'visited'>()
    const reportedCycles = new Set<string>()

    const verifyRoute = (stepId: string, path: string[]) => {
      if (!uniqueStepIds.has(stepId) || variant.stepOverrides[stepId]?.hidden) return

      if (visitState.get(stepId) === 'visiting') {
        const cycleStart = path.indexOf(stepId)
        const cycle = [...path.slice(Math.max(cycleStart, 0)), stepId].join(' -> ')
        if (!reportedCycles.has(cycle)) {
          reportedCycles.add(cycle)
          context.addIssue({
            code: 'custom',
            path: ['experiment', 'variants', variantId],
            message: `Variant ${variantId} contains a cycle: ${cycle}`
          })
        }
        return
      }

      if (visitState.get(stepId) === 'visited') return

      const step = stepsById.get(stepId)
      if (!step) return

      visitState.set(stepId, 'visiting')
      const override = variant.stepOverrides[stepId]
      const next = step.type === 'result' ? undefined : (override?.next ?? step.next)
      const targets = transitionTargets(next).filter(
        (targetId) => uniqueStepIds.has(targetId) && !variant.stepOverrides[targetId]?.hidden
      )

      if (targets.length === 0 && step.type !== 'result') {
        context.addIssue({
          code: 'custom',
          path: ['experiment', 'variants', variantId],
          message: `Variant ${variantId} route terminates at non-result step ${stepId}`
        })
      }

      targets.forEach((targetId) => verifyRoute(targetId, [...path, stepId]))
      visitState.set(stepId, 'visited')
    }

    verifyRoute(config.entryStepId, [])
  })
})

export type FunnelVariantId = z.infer<typeof FunnelVariantIdSchema>
export type FunnelCondition = z.infer<typeof FunnelConditionSchema>
export type DirectTransition = z.infer<typeof DirectTransitionSchema>
export type BranchTransition = z.infer<typeof BranchTransitionSchema>
export type FunnelTransition = z.infer<typeof FunnelTransitionSchema>
export type SelectOptionConfig = z.infer<typeof SelectOptionSchema>
export type InfoStepConfig = z.infer<typeof InfoStepConfigSchema>
export type SingleSelectStepConfig = z.infer<typeof SingleSelectStepConfigSchema>
export type MultiSelectStepConfig = z.infer<typeof MultiSelectStepConfigSchema>
export type NumberStepConfig = z.infer<typeof NumberStepConfigSchema>
export type ResultStepConfig = z.infer<typeof ResultStepConfigSchema>
export type FunnelStepConfig = z.infer<typeof FunnelStepConfigSchema>
export type FunnelStepType = FunnelStepConfig['type']
export type FunnelStepOverride = z.infer<typeof FunnelStepOverrideSchema>
export type FunnelVariantConfig = z.infer<typeof FunnelVariantConfigSchema>
export type FunnelCustomEvent = z.infer<typeof FunnelCustomEventSchema>
export type FunnelConfig = z.infer<typeof FunnelConfigSchema>
export type FunnelAnswer = string | string[] | number

export const FunnelVersionSummarySchema = z.object({
  funnelId: NonEmptyStringSchema,
  version: z.number().int().positive(),
  status: z.enum(['draft', 'active', 'archived']),
  createdAt: z.iso.datetime(),
  publishedAt: z.iso.datetime().nullable()
})

export const FunnelVersionsResponseSchema = z.object({
  activeVersion: z.number().int().positive(),
  versions: z.array(FunnelVersionSummarySchema)
})

export const CreateFunnelVersionRequestSchema = z.object({
  config: z.unknown()
})

const FunnelVariantPreviewSchema = z.object({
  reachableSteps: z.number().int().min(1),
  routes: z.number().int().min(1),
  resultSteps: z.array(NonEmptyStringSchema).min(1)
})

export const FunnelConfigPreviewResponseSchema = z.object({
  valid: z.literal(true),
  version: z.number().int().positive(),
  variants: z.object({
    A: FunnelVariantPreviewSchema,
    B: FunnelVariantPreviewSchema
  })
})

export type FunnelVersionSummary = z.infer<typeof FunnelVersionSummarySchema>
export type FunnelVersionsResponse = z.infer<typeof FunnelVersionsResponseSchema>
export type FunnelConfigPreviewResponse = z.infer<typeof FunnelConfigPreviewResponseSchema>

export const FunnelAnswerSchema = z.union([z.string(), z.number(), z.array(z.string())])
export const FunnelAnswersSchema = z.record(z.string(), FunnelAnswerSchema)

export const FunnelSessionSchema = z.object({
  id: z.uuid(),
  funnelId: NonEmptyStringSchema,
  version: z.number().int().positive(),
  variant: FunnelVariantIdSchema,
  currentStepId: NonEmptyStringSchema,
  trail: z.array(NonEmptyStringSchema).min(1),
  cursor: z.number().int().min(0),
  answers: FunnelAnswersSchema,
  utm: z.record(z.string(), z.string()),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable()
})

export const CreateSessionRequestSchema = z.object({
  variant: FunnelVariantIdSchema.optional(),
  utm: z.record(z.string(), z.string()).optional(),
  clientTimestamp: z.iso.datetime().optional()
})

export const SubmitAnswerRequestSchema = z.object({
  stepId: NonEmptyStringSchema,
  answer: FunnelAnswerSchema.optional(),
  clientTimestamp: z.iso.datetime().optional()
})

export const BackSessionRequestSchema = z.object({
  clientTimestamp: z.iso.datetime().optional()
})

export const SessionStateResponseSchema = z.object({
  session: FunnelSessionSchema
})

export const SessionBootstrapResponseSchema = SessionStateResponseSchema.extend({
  config: FunnelConfigSchema
})

export type FunnelAnswers = z.infer<typeof FunnelAnswersSchema>
export type FunnelSession = z.infer<typeof FunnelSessionSchema>
export type CreateSessionRequest = z.infer<typeof CreateSessionRequestSchema>
export type SubmitAnswerRequest = z.infer<typeof SubmitAnswerRequestSchema>
export type BackSessionRequest = z.infer<typeof BackSessionRequestSchema>
export type SessionStateResponse = z.infer<typeof SessionStateResponseSchema>
export type SessionBootstrapResponse = z.infer<typeof SessionBootstrapResponseSchema>

export const FunnelEventNameSchema = z.enum([
  'session_started',
  'step_viewed',
  'answer_submitted',
  'step_completed',
  'back_clicked',
  'result_viewed',
  'cta_clicked'
])

export const ClientFunnelEventNameSchema = z.enum(['step_viewed', 'result_viewed', 'cta_clicked'])

export const FunnelEventPropertiesSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()])
)

export const ClientFunnelEventSchema = z.object({
  eventId: z.uuid(),
  sessionId: z.uuid(),
  name: ClientFunnelEventNameSchema,
  clientTimestamp: z.iso.datetime(),
  stepId: NonEmptyStringSchema,
  properties: FunnelEventPropertiesSchema.default({})
})

export const EventBatchRequestSchema = z.object({
  events: z.array(z.unknown()).min(1).max(50)
})

export const RejectedEventSchema = z.object({
  index: z.number().int().min(0),
  eventId: z.string().optional(),
  message: z.string()
})

export const EventBatchResponseSchema = z.object({
  accepted: z.array(z.uuid()),
  duplicates: z.array(z.uuid()),
  rejected: z.array(RejectedEventSchema)
})

const AnalyticsTotalsSchema = z.object({
  sessionsStarted: z.number().int().min(0),
  resultReached: z.number().int().min(0),
  ctaClicked: z.number().int().min(0),
  resultRate: z.number().min(0),
  ctaCtr: z.number().min(0)
})

const AnalyticsVariantSchema = AnalyticsTotalsSchema.extend({
  variant: FunnelVariantIdSchema
})

const AnalyticsVersionSchema = AnalyticsTotalsSchema.extend({
  version: z.number().int().positive()
})

const AnalyticsStepSchema = z.object({
  stepId: NonEmptyStringSchema,
  title: NonEmptyStringSchema,
  viewed: z.number().int().min(0),
  completed: z.number().int().min(0),
  dropoff: z.number().int().min(0),
  conversionRate: z.number().min(0)
})

const AnalyticsEventSchema = z.object({
  name: NonEmptyStringSchema,
  sessions: z.number().int().min(0)
})

export const AnalyticsResponseSchema = z.object({
  totals: AnalyticsTotalsSchema,
  variants: z.array(AnalyticsVariantSchema),
  versions: z.array(AnalyticsVersionSchema),
  steps: z.array(AnalyticsStepSchema),
  events: z.array(AnalyticsEventSchema),
  campaigns: z.array(z.string()),
  activeCampaign: z.string().nullable()
})

export type FunnelEventName = z.infer<typeof FunnelEventNameSchema>
export type FunnelEventProperties = z.infer<typeof FunnelEventPropertiesSchema>
export type ClientFunnelEvent = z.infer<typeof ClientFunnelEventSchema>
export type EventBatchResponse = z.infer<typeof EventBatchResponseSchema>
export type AnalyticsResponse = z.infer<typeof AnalyticsResponseSchema>
