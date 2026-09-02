import type { FunnelAnswer, FunnelStepConfig } from '@funnel/contracts'

import { FormError } from '../ui/FormError'
import { StepActions } from './StepActions'
import { InfoStep } from './steps/InfoStep'
import { MultiSelectStep } from './steps/MultiSelectStep'
import { NumberStep } from './steps/NumberStep'
import { ResultStep } from './steps/ResultStep'
import { SingleSelectStep } from './steps/SingleSelectStep'

type FunnelStepRendererProps = {
  step: FunnelStepConfig
  draft: FunnelAnswer | undefined
  error: string | null
  canGoBack: boolean
  onDraftChange: (value: FunnelAnswer) => void
  onContinue: () => void
  onBack: () => void
}

export function FunnelStepRenderer({
  step,
  draft,
  error,
  canGoBack,
  onDraftChange,
  onContinue,
  onBack
}: FunnelStepRendererProps) {
  if (step.type === 'result') {
    return (
      <ResultStep
        title={step.title}
        body={step.description ?? ''}
        ctaLabel={step.cta.label}
        onCta={() => window.open(step.cta.href, '_blank', 'noopener,noreferrer')}
      />
    )
  }

  return (
    <div className="animate-step-enter">
      {step.type === 'info' ? <InfoStep title={step.title} body={step.description ?? ''} /> : null}

      {step.type === 'single-select' ? (
        <SingleSelectStep
          name={step.id}
          title={step.title}
          options={step.options.map((option) => ({
            value: option.value,
            label: option.label,
            ...(option.description ? { description: option.description } : {})
          }))}
          value={typeof draft === 'string' ? draft : ''}
          onChange={onDraftChange}
          {...(step.description ? { description: step.description } : {})}
        />
      ) : null}

      {step.type === 'multi-select' ? (
        <MultiSelectStep
          name={step.id}
          title={step.title}
          options={step.options.map((option) => ({
            value: option.value,
            label: option.label,
            ...(option.description ? { description: option.description } : {})
          }))}
          value={Array.isArray(draft) ? draft : []}
          onChange={onDraftChange}
          {...(step.description ? { description: step.description } : {})}
        />
      ) : null}

      {step.type === 'number' ? (
        <NumberStep
          id={step.id}
          title={step.title}
          label={step.label}
          value={draft === undefined ? '' : String(draft)}
          onChange={onDraftChange}
          {...(step.description ? { description: step.description } : {})}
          {...(step.min !== undefined ? { min: step.min } : {})}
          {...(step.max !== undefined ? { max: step.max } : {})}
          {...(step.suffix ? { suffix: step.suffix } : {})}
        />
      ) : null}

      {error ? <FormError>{error}</FormError> : null}

      <StepActions
        continueLabel={step.type === 'info' ? 'Начать' : 'Продолжить'}
        onContinue={onContinue}
        {...(canGoBack ? { onBack } : {})}
      />
    </div>
  )
}
