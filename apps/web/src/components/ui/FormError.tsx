import type { ReactNode } from 'react'

type FormErrorProps = {
  id?: string | undefined
  children: ReactNode
}

export function FormError({ id, children }: FormErrorProps) {
  return (
    <p id={id} className="mt-2 text-sm font-medium text-danger" role="alert">
      {children}
    </p>
  )
}
