import type { ReactNode } from 'react'

type FunnelLayoutProps = {
  progress?: ReactNode
  children: ReactNode
}

export function FunnelLayout({ progress, children }: FunnelLayoutProps) {
  return (
    <section className="w-full rounded-panel border border-line bg-surface p-5 shadow-panel sm:p-8">
      {progress ? <div className="mb-9">{progress}</div> : null}
      {children}
    </section>
  )
}
