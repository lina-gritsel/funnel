import type { InputHTMLAttributes } from 'react'

import { FormError } from './FormError'

type NumberInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  id: string
  label: string
  description?: string
  error?: string
  suffix?: string
}

export function NumberInput({
  id,
  label,
  description,
  error,
  suffix,
  className = '',
  ...props
}: NumberInputProps) {
  const descriptionId = description ? `${id}-description` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [descriptionId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className={className}>
      <label className="mb-2 block text-sm font-semibold text-ink" htmlFor={id}>
        {label}
      </label>
      {description ? (
        <p id={descriptionId} className="mb-3 text-sm text-muted">
          {description}
        </p>
      ) : null}
      <div className="relative">
        <input
          id={id}
          className={`min-h-14 w-full rounded-control border bg-surface px-4 text-lg font-semibold text-ink outline-none transition-colors placeholder:text-muted/55 focus:border-accent focus:ring-2 focus:ring-accent/20 ${suffix ? 'pr-12' : ''} ${error ? 'border-danger' : 'border-line'}`}
          type="number"
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          {...props}
        />
        {suffix ? (
          <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm font-medium text-muted">
            {suffix}
          </span>
        ) : null}
      </div>
      {error ? <FormError id={errorId}>{error}</FormError> : null}
    </div>
  )
}
