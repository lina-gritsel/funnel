import type { ButtonHTMLAttributes } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  isLoading?: boolean | undefined
}

const variantClass: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover disabled:bg-accent/45',
  secondary: 'border border-line bg-surface text-ink hover:border-accent/35 hover:bg-accent-soft',
  ghost: 'text-muted hover:bg-accent-soft hover:text-ink'
}

export function Button({
  variant = 'primary',
  isLoading = false,
  disabled,
  className = '',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex min-h-12 items-center justify-center rounded-control px-5 text-sm font-semibold transition-[color,background-color,border-color,transform] focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:outline-none active:translate-y-px disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-70 ${variantClass[variant]} ${className}`}
      disabled={disabled || isLoading}
      aria-busy={isLoading}
      {...props}
    >
      {isLoading ? 'Подождите…' : children}
    </button>
  )
}
