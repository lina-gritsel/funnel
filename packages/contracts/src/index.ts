export type FunnelVariantId = 'A' | 'B'

export type FunnelStepType = 'info' | 'single-select' | 'multi-select' | 'number' | 'result'

export type FunnelAnswer = string | string[] | number

export type FunnelCondition = {
  stepId: string
  operator: 'equals' | 'includes' | 'greater-than' | 'less-than'
  value: string | number
}

export type DirectTransition = {
  type: 'direct'
  stepId: string
}

export type BranchTransition = {
  type: 'branch'
  rules: Array<{
    when: FunnelCondition
    stepId: string
  }>
  fallbackStepId: string
}

export type FunnelTransition = DirectTransition | BranchTransition

type FunnelStepBase = {
  id: string
  type: FunnelStepType
  title: string
  description?: string
  next?: FunnelTransition
}

export type InfoStepConfig = FunnelStepBase & {
  type: 'info'
}

export type SelectOptionConfig = {
  value: string
  label: string
  description?: string
}

export type SingleSelectStepConfig = FunnelStepBase & {
  type: 'single-select'
  options: SelectOptionConfig[]
  validation: {
    required: boolean
  }
}

export type MultiSelectStepConfig = FunnelStepBase & {
  type: 'multi-select'
  options: SelectOptionConfig[]
  validation: {
    required: boolean
    minSelections?: number
    maxSelections?: number
  }
}

export type NumberStepConfig = FunnelStepBase & {
  type: 'number'
  label: string
  min?: number
  max?: number
  suffix?: string
  validation: {
    required: boolean
  }
}

export type ResultStepConfig = FunnelStepBase & {
  type: 'result'
  cta: {
    label: string
    href: string
  }
}

export type FunnelStepConfig =
  | InfoStepConfig
  | SingleSelectStepConfig
  | MultiSelectStepConfig
  | NumberStepConfig
  | ResultStepConfig

export type FunnelStepOverride = {
  title?: string
  description?: string
  next?: FunnelTransition
  ctaLabel?: string
  hidden?: boolean
}

export type FunnelVariantConfig = {
  name: string
  description: string
  weight: number
  stepOverrides: Record<string, FunnelStepOverride>
}

export type FunnelConfig = {
  schemaVersion: 1
  id: string
  name: string
  version: number
  status: 'draft' | 'active' | 'archived'
  createdAt: string
  publishedAt?: string
  entryStepId: string
  experiment: {
    id: string
    hypothesis: string
    primaryMetric: string
    variants: Record<FunnelVariantId, FunnelVariantConfig>
  }
  steps: FunnelStepConfig[]
}
