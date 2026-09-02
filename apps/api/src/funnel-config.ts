import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { FunnelConfigSchema, type FunnelConfig } from '@funnel/contracts'

const configDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../../../configs')

export class FunnelConfigValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid funnel config:\n${issues.map((issue) => `- ${issue}`).join('\n')}`)
    this.name = 'FunnelConfigValidationError'
  }
}

export function parseFunnelConfig(value: unknown): FunnelConfig {
  const result = FunnelConfigSchema.safeParse(value)

  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''
      return `${path}${issue.message}`
    })
    throw new FunnelConfigValidationError(issues)
  }

  return result.data
}

export async function loadActiveFunnelConfig(): Promise<FunnelConfig> {
  const source = await readFile(resolve(configDirectory, 'funnel-v1.json'), 'utf8')
  return parseFunnelConfig(JSON.parse(source) as unknown)
}
