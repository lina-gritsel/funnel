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
export type FunnelConfig = z.infer<typeof FunnelConfigSchema>
export type FunnelAnswer = string | string[] | number
