import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { FunnelConfig, FunnelTransition, FunnelVariantId } from '@funnel/contracts'

const supportedStepTypes = new Set(['info', 'single-select', 'multi-select', 'number', 'result'])
const configDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../../../configs')

export class FunnelConfigValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid funnel config:\n${issues.map((issue) => `- ${issue}`).join('\n')}`)
    this.name = 'FunnelConfigValidationError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function validateTransition(value: unknown, path: string, issues: string[], targets: string[]) {
  if (!isRecord(value)) {
    issues.push(`${path} must be an object`)
    return
  }

  if (value.type === 'direct') {
    if (!hasString(value.stepId)) {
      issues.push(`${path}.stepId must be a non-empty string`)
      return
    }

    targets.push(value.stepId)
    return
  }

  if (value.type !== 'branch') {
    issues.push(`${path}.type must be direct or branch`)
    return
  }

  if (!Array.isArray(value.rules) || value.rules.length === 0) {
    issues.push(`${path}.rules must contain at least one rule`)
  } else {
    value.rules.forEach((rule, ruleIndex) => {
      if (!isRecord(rule) || !hasString(rule.stepId) || !isRecord(rule.when)) {
        issues.push(`${path}.rules[${ruleIndex}] is invalid`)
        return
      }

      const condition = rule.when
      const validOperator = ['equals', 'includes', 'greater-than', 'less-than'].includes(
        String(condition.operator)
      )

      if (!hasString(condition.stepId) || !validOperator || condition.value === undefined) {
        issues.push(`${path}.rules[${ruleIndex}].when is invalid`)
      }

      targets.push(rule.stepId)
    })
  }

  if (!hasString(value.fallbackStepId)) {
    issues.push(`${path}.fallbackStepId must be a non-empty string`)
  } else {
    targets.push(value.fallbackStepId)
  }
}

function validateOptions(value: unknown, path: string, issues: string[]) {
  if (!Array.isArray(value) || value.length === 0) {
    issues.push(`${path} must contain at least one option`)
    return
  }

  value.forEach((option, optionIndex) => {
    if (!isRecord(option) || !hasString(option.value) || !hasString(option.label)) {
      issues.push(`${path}[${optionIndex}] must contain value and label`)
    }
  })
}

function validateStep(value: unknown, index: number, issues: string[], targets: string[]) {
  const path = `steps[${index}]`

  if (!isRecord(value)) {
    issues.push(`${path} must be an object`)
    return
  }

  if (!hasString(value.id)) issues.push(`${path}.id must be a non-empty string`)
  if (!hasString(value.title)) issues.push(`${path}.title must be a non-empty string`)
  if (!hasString(value.type) || !supportedStepTypes.has(value.type)) {
    issues.push(`${path}.type is not supported`)
    return
  }

  if (value.type === 'single-select' || value.type === 'multi-select') {
    validateOptions(value.options, `${path}.options`, issues)
    if (!isRecord(value.validation) || typeof value.validation.required !== 'boolean') {
      issues.push(`${path}.validation.required must be boolean`)
    }
  }

  if (value.type === 'number') {
    if (!hasString(value.label)) issues.push(`${path}.label must be a non-empty string`)
    if (!isRecord(value.validation) || typeof value.validation.required !== 'boolean') {
      issues.push(`${path}.validation.required must be boolean`)
    }
  }

  if (value.type === 'result') {
    if (!isRecord(value.cta) || !hasString(value.cta.label) || !hasString(value.cta.href)) {
      issues.push(`${path}.cta must contain label and href`)
    }
    if (value.next !== undefined) issues.push(`${path} result step cannot have a transition`)
    return
  }

  if (value.next === undefined) {
    issues.push(`${path}.next is required for a non-result step`)
  } else {
    validateTransition(value.next, `${path}.next`, issues, targets)
  }
}

function transitionTargets(transition: FunnelTransition | undefined): string[] {
  if (!transition) return []
  if (transition.type === 'direct') return [transition.stepId]

  return [...transition.rules.map((rule) => rule.stepId), transition.fallbackStepId]
}

function validateReachability(config: FunnelConfig, issues: string[]) {
  const stepsById = new Map(config.steps.map((step) => [step.id, step]))
  const variants: FunnelVariantId[] = ['A', 'B']

  for (const variantId of variants) {
    const variant = config.experiment.variants[variantId]
    const visited = new Set<string>()
    const queue = [config.entryStepId]

    while (queue.length > 0) {
      const stepId = queue.shift()
      if (!stepId || visited.has(stepId)) continue

      const step = stepsById.get(stepId)
      if (!step) continue

      visited.add(stepId)
      const override = variant.stepOverrides[stepId]
      const next = override?.next ?? step.next
      queue.push(...transitionTargets(next))
    }

    const unreachable = config.steps
      .filter((step) => !variant.stepOverrides[step.id]?.hidden && !visited.has(step.id))
      .map((step) => step.id)

    if (unreachable.length > 0) {
      issues.push(`variant ${variantId} has unreachable steps: ${unreachable.join(', ')}`)
    }

    const reachesResult = config.steps.some(
      (step) => step.type === 'result' && visited.has(step.id)
    )
    if (!reachesResult) issues.push(`variant ${variantId} cannot reach a result step`)
  }
}

export function parseFunnelConfig(value: unknown): FunnelConfig {
  const issues: string[] = []

  if (!isRecord(value)) throw new FunnelConfigValidationError(['config must be an object'])

  if (value.schemaVersion !== 1) issues.push('schemaVersion must be 1')
  if (!hasString(value.id)) issues.push('id must be a non-empty string')
  if (!hasString(value.name)) issues.push('name must be a non-empty string')
  if (!Number.isInteger(value.version) || Number(value.version) < 1) {
    issues.push('version must be a positive integer')
  }
  if (!['draft', 'active', 'archived'].includes(String(value.status))) {
    issues.push('status must be draft, active or archived')
  }
  if (!hasString(value.createdAt)) issues.push('createdAt must be a non-empty string')
  if (!hasString(value.entryStepId)) issues.push('entryStepId must be a non-empty string')

  const steps = Array.isArray(value.steps) ? value.steps : []
  if (steps.length < 6) issues.push('steps must contain at least six screens')

  const transitionTargetIds: string[] = []
  steps.forEach((step, index) => validateStep(step, index, issues, transitionTargetIds))

  const stepIds = steps
    .filter(isRecord)
    .map((step) => step.id)
    .filter(hasString)
  const uniqueStepIds = new Set(stepIds)

  if (uniqueStepIds.size !== stepIds.length) issues.push('step ids must be unique')
  if (hasString(value.entryStepId) && !uniqueStepIds.has(value.entryStepId)) {
    issues.push('entryStepId must reference an existing step')
  }
  transitionTargetIds.forEach((targetId) => {
    if (!uniqueStepIds.has(targetId)) issues.push(`transition references unknown step ${targetId}`)
  })

  const branchCount = steps.filter(
    (step) => isRecord(step) && isRecord(step.next) && step.next.type === 'branch'
  ).length
  if (branchCount === 0) issues.push('config must contain at least one branch')
  if (!steps.some((step) => isRecord(step) && step.type === 'result')) {
    issues.push('config must contain a result step')
  }

  if (!isRecord(value.experiment)) {
    issues.push('experiment must be an object')
  } else {
    const experiment = value.experiment
    if (!hasString(experiment.id)) issues.push('experiment.id must be a non-empty string')
    if (!hasString(experiment.hypothesis)) {
      issues.push('experiment.hypothesis must be a non-empty string')
    }
    if (!hasString(experiment.primaryMetric)) {
      issues.push('experiment.primaryMetric must be a non-empty string')
    }

    if (!isRecord(experiment.variants)) {
      issues.push('experiment.variants must contain A and B')
    } else {
      const weights: number[] = []
      for (const variantId of ['A', 'B'] as const) {
        const variant = experiment.variants[variantId]
        if (!isRecord(variant)) {
          issues.push(`experiment.variants.${variantId} is required`)
          continue
        }
        if (!hasString(variant.name)) issues.push(`variant ${variantId} name is required`)
        if (!hasString(variant.description)) {
          issues.push(`variant ${variantId} description is required`)
        }
        if (typeof variant.weight !== 'number' || variant.weight <= 0) {
          issues.push(`variant ${variantId} weight must be positive`)
        } else {
          weights.push(variant.weight)
        }

        if (!isRecord(variant.stepOverrides)) {
          issues.push(`variant ${variantId} stepOverrides must be an object`)
          continue
        }

        Object.entries(variant.stepOverrides).forEach(([stepId, override]) => {
          if (!uniqueStepIds.has(stepId)) {
            issues.push(`variant ${variantId} overrides unknown step ${stepId}`)
          }
          if (!isRecord(override)) {
            issues.push(`variant ${variantId} override for ${stepId} must be an object`)
            return
          }
          if (override.next !== undefined) {
            const overrideTargets: string[] = []
            validateTransition(
              override.next,
              `experiment.variants.${variantId}.stepOverrides.${stepId}.next`,
              issues,
              overrideTargets
            )
            overrideTargets.forEach((targetId) => {
              if (!uniqueStepIds.has(targetId)) {
                issues.push(`variant ${variantId} transition references unknown step ${targetId}`)
              }
            })
          }
        })
      }
      if (weights.length === 2 && weights.reduce((sum, weight) => sum + weight, 0) !== 100) {
        issues.push('variant weights must add up to 100')
      }
    }
  }

  if (issues.length > 0) throw new FunnelConfigValidationError([...new Set(issues)])

  const config = value as FunnelConfig
  validateReachability(config, issues)

  if (issues.length > 0) throw new FunnelConfigValidationError(issues)

  return config
}

export async function loadActiveFunnelConfig(): Promise<FunnelConfig> {
  const source = await readFile(resolve(configDirectory, 'funnel-v1.json'), 'utf8')
  return parseFunnelConfig(JSON.parse(source) as unknown)
}
