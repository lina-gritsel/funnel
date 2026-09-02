import type { FunnelConfig } from '@funnel/contracts'

export async function fetchActiveFunnel({
  signal
}: {
  signal: AbortSignal
}): Promise<FunnelConfig> {
  const response = await fetch('/api/funnels/active', { signal })

  if (!response.ok) {
    throw new Error('Active funnel config request failed')
  }

  return response.json() as Promise<FunnelConfig>
}
