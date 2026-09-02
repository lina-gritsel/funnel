import { ChoiceOption } from '../../ui/ChoiceOption'
import { StepHeader } from '../StepHeader'

type SingleSelectOption = {
  value: string
  label: string
  description?: string
}

type SingleSelectStepProps = {
  name: string
  title: string
  description?: string
  options: SingleSelectOption[]
  value: string
  onChange: (value: string) => void
}

export function SingleSelectStep({
  name,
  title,
  description,
  options,
  value,
  onChange
}: SingleSelectStepProps) {
  const titleId = `${name}-title`

  return (
    <fieldset aria-labelledby={titleId}>
      <StepHeader id={titleId} title={title} description={description} />
      <div className="grid gap-3">
        {options.map((option) => (
          <ChoiceOption
            key={option.value}
            name={name}
            label={option.label}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            {...(option.description ? { description: option.description } : {})}
          />
        ))}
      </div>
    </fieldset>
  )
}
