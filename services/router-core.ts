import type { ProviderId, RouteDecision } from '../store/types'

export const localOnlyDecision = (
  reason: string,
  provider: Exclude<ProviderId, 'cloud'> = 'gemma-local',
): RouteDecision => ({
  tier: 'medium',
  provider,
  label: `local-only:${reason}`,
  confidence: 1,
  latencyMs: 0,
  routed: false,
})

export const manualDecision = (provider: ProviderId): RouteDecision => ({
  tier: provider === 'cloud' ? 'large' : 'medium',
  provider,
  label: 'manual',
  confidence: 1,
  latencyMs: 0,
  routed: false,
})

export const fallbackDecision = (
  reason: string,
  start: number,
  provider: ProviderId,
): RouteDecision => ({
  tier: provider === 'cloud' ? 'large' : 'medium',
  provider,
  label: `fallback:${reason}`,
  confidence: 0,
  latencyMs: performance.now() - start,
  routed: false,
})
