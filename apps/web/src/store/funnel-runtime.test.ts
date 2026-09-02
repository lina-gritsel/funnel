import { FunnelConfigSchema } from '@funnel/contracts'
import { beforeEach, describe, expect, it } from 'vitest'

import configJson from '../../../../configs/funnel-v1.json'
import { useFunnelRuntimeStore } from './funnel-runtime'

const config = FunnelConfigSchema.parse(configJson)

function submit(value?: string | string[] | number) {
  if (value !== undefined) useFunnelRuntimeStore.getState().setDraft(value)
  const result = useFunnelRuntimeStore.getState().submitCurrent()
  if (!result.success) throw new Error(result.error)
}

beforeEach(() => {
  useFunnelRuntimeStore.getState().initialize(config, 'A')
})

describe('funnel runtime store', () => {
  it('keeps committed answers when the user goes back', () => {
    submit()
    submit('invest')
    submit('500000')

    expect(useFunnelRuntimeStore.getState().trail.at(-1)).toBe('priorities')

    useFunnelRuntimeStore.getState().goBack()
    expect(useFunnelRuntimeStore.getState().draft).toBe(500000)

    useFunnelRuntimeStore.getState().goBack()
    expect(useFunnelRuntimeStore.getState().draft).toBe('invest')

    submit()
    expect(useFunnelRuntimeStore.getState().draft).toBe(500000)
  })

  it('drops the old future route when a branching answer changes', () => {
    submit()
    submit('invest')
    submit('500000')
    submit(['support'])
    submit('beginner')

    expect(useFunnelRuntimeStore.getState().trail.at(-1)).toBe('education')

    useFunnelRuntimeStore.getState().goBack()
    useFunnelRuntimeStore.getState().setDraft('experienced')
    submit()

    expect(useFunnelRuntimeStore.getState().trail.at(-1)).toBe('result')
    expect(useFunnelRuntimeStore.getState().trail).not.toContain('education')
  })
})
