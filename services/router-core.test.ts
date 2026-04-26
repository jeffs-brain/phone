import { describe, expect, it } from 'bun:test'

import { localOnlyDecision, manualDecision } from './router-core'

describe('router core decisions', () => {
  it('keeps offline Apple Foundation routing local', () => {
    expect(localOnlyDecision('offline', 'apple-fm')).toEqual({
      tier: 'medium',
      provider: 'apple-fm',
      label: 'local-only:offline',
      confidence: 1,
      latencyMs: 0,
      routed: false,
    })
  })

  it('uses local Gemma as the default local-only provider', () => {
    expect(localOnlyDecision('offline')).toEqual({
      tier: 'medium',
      provider: 'gemma-local',
      label: 'local-only:offline',
      confidence: 1,
      latencyMs: 0,
      routed: false,
    })
  })

  it('maps manual cloud to the large tier and local providers to medium', () => {
    expect(manualDecision('cloud').tier).toEqual('large')
    expect(manualDecision('gemma-local').tier).toEqual('medium')
    expect(manualDecision('apple-fm').tier).toEqual('medium')
  })
})
