import { MultiChoiceOption } from '../../ui/MultiChoiceOption'
import { StepHeader } from '../StepHeader'

type MultiSelectOption = {
  value: string
  label: string
  description?: string
}

type MultiSelectStepProps = {
  name: string
  title: string
  description?: string
  options: MultiSelectOption[]
  value: string[]
  onChange: (value: string[]) => void
}

export function MultiSelectStep({
  name,
  title,
  description,
  options,
  value,
  onChange
}: MultiSelectStepProps) {
  const titleId = `${name}-title`

  function toggleOption(optionValue: string) {
    onChange(
      value.includes(optionValue)
        ? value.filter((item) => item !== optionValue)
        : [...value, optionValue]
    )
  }

  return (
    <fieldset aria-labelledby={titleId}>
      <StepHeader id={titleId} title={title} description={description} />
      <div className="grid gap-3">
        {options.map((option) => (
          <MultiChoiceOption
            key={option.value}
            name={name}
            label={option.label}
            value={option.value}
            checked={value.includes(option.value)}
            onChange={() => toggleOption(option.value)}
            {...(option.description ? { description: option.description } : {})}
          />
        ))}
      </div>
    </fieldset>
  )
}
