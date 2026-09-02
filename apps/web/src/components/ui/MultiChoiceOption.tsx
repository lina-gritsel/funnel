import type { InputHTMLAttributes } from 'react'

type MultiChoiceOptionProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: string
  description?: string
}

export function MultiChoiceOption({
  label,
  description,
  className = '',
  ...props
}: MultiChoiceOptionProps) {
  return (
    <label
      className={`flex min-h-16 gap-3 rounded-control border px-4 py-3 transition-colors ${props.checked ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:border-accent/35'} ${props.disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'} ${className}`}
    >
      <input
        className="mt-0.5 h-5 w-5 shrink-0 accent-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        type="checkbox"
        {...props}
      />
      <span>
        <span className="block text-sm font-semibold text-ink">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-sm leading-5 text-muted">{description}</span>
        ) : null}
      </span>
    </label>
  )
}
