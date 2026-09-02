import { AnalyticsResponseSchema, type AnalyticsResponse } from '@funnel/contracts'

export async function fetchAnalytics({
  campaign,
  signal
}: {
  campaign?: string
  signal: AbortSignal
}): Promise<AnalyticsResponse> {
  const search = new URLSearchParams()
  if (campaign) search.set('utmCampaign', campaign)
  const response = await fetch(`/api/analytics${search.size ? `?${search}` : ''}`, { signal })
  if (!response.ok) throw new Error('Analytics request failed')
  return AnalyticsResponseSchema.parse(await response.json())
}
