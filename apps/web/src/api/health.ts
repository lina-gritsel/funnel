export type HealthResponse = {
  service: string
  status: 'ok'
  timestamp: string
}

export async function fetchHealth({ signal }: { signal: AbortSignal }): Promise<HealthResponse> {
  const response = await fetch('/api/health', { signal })

  if (!response.ok) {
    throw new Error('API health check failed')
  }

  return response.json() as Promise<HealthResponse>
}
