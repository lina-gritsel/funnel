import type { SelectHTMLAttributes } from 'react'

import { FormError } from './FormError'

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  id: string
  label: string
  description?: string
  error?: string
}

export function Select({
  id,
  label,
  description,
  error,
  className = '',
  children,
  ...props
}: SelectProps) {
  const descriptionId = description ? `${id}-description` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [descriptionId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className={className}>
      <label className="mb-2 block text-sm font-semibold text-ink" htmlFor={id}>
        {label}
      </label>
      {description ? (
        <p id={descriptionId} className="mb-3 text-sm leading-5 text-muted">
          {description}
        </p>
      ) : null}
      <select
        id={id}
        className={`min-h-14 w-full rounded-control border bg-surface px-4 text-base font-medium text-ink outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20 ${error ? 'border-danger' : 'border-line'}`}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        {...props}
      >
        {children}
      </select>
      {error ? <FormError id={errorId}>{error}</FormError> : null}
    </div>
  )
}
