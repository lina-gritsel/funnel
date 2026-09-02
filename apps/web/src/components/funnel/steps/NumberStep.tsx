import { NumberInput } from '../../ui/NumberInput'
import { StepHeader } from '../StepHeader'

type NumberStepProps = {
  id: string
  title: string
  description?: string
  label: string
  value: string
  min?: number
  max?: number
  suffix?: string
  error?: string
  onChange: (value: string) => void
}

export function NumberStep({
  id,
  title,
  description,
  label,
  value,
  min,
  max,
  suffix,
  error,
  onChange
}: NumberStepProps) {
  return (
    <div>
      <StepHeader title={title} description={description} />
      <NumberInput
        id={id}
        label={label}
        value={value}
        min={min}
        max={max}
        onChange={(event) => onChange(event.target.value)}
        {...(suffix ? { suffix } : {})}
        {...(error ? { error } : {})}
      />
    </div>
  )
}
