import { Button } from '../../ui/Button'
import { StepHeader } from '../StepHeader'

type ResultStepProps = {
  title: string
  body: string
  ctaLabel: string
  onCta?: () => void
}

export function ResultStep({ title, body, ctaLabel, onCta }: ResultStepProps) {
  return (
    <div>
      <p className="mb-4 inline-flex rounded-full bg-accent-soft px-3 py-1 text-xs font-bold tracking-[0.08em] text-accent uppercase">
        Результат готов
      </p>
      <StepHeader title={title} description={body} />
      <Button type="button" onClick={onCta}>
        {ctaLabel}
      </Button>
    </div>
  )
}
