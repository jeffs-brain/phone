import Constants from 'expo-constants'

import type { ProviderId, RouteDecision, Tier } from '../store/types'

const FASTINO_API_KEY = process.env.EXPO_PUBLIC_FASTINO_API_KEY ?? Constants.expoConfig?.extra?.fastinoApiKey

const FASTINO_ENDPOINT = 'https://api.fastino.com/run'
const FASTINO_TIMEOUT_MS = 250
const FASTINO_LABELS = 'trivial_chat,factual_qa,reasoning_or_code,long_context_or_creative'

const LABEL_TO_TIER: Record<string, Tier> = {
  trivial_chat: 'small',
  factual_qa: 'small',
  reasoning_or_code: 'medium',
  long_context_or_creative: 'large',
}

const TIER_TO_PROVIDER: Record<Tier, ProviderId> = {
  small: 'apple-fm', // service.dispatch falls back to gemma-local if Apple FM unavailable
  medium: 'gemma-local',
  large: 'cloud',
}

const bumpUp = (t: Tier): Tier => (t === 'small' ? 'medium' : 'large')

const fetchWithTimeout = (url: string, init: RequestInit, timeoutMs: number): Promise<Response> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer))
}

export const routerService = {
  async classify(message: string, history: string[]): Promise<RouteDecision> {
    const start = performance.now()
    if (!FASTINO_API_KEY) {
      return fallback('missing-key', start)
    }

    try {
      const ctx = history.slice(-3).join('\n')
      const response = await fetchWithTimeout(FASTINO_ENDPOINT, {
        method: 'POST',
        headers: {
          'x-api-key': FASTINO_API_KEY,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model_id: 'fastino-classification-en',
          input: [{
            text: `${ctx}\n\nuser: ${message}`,
            parameters: {
              classifications: [{ task: 'intent', labels: FASTINO_LABELS }],
            },
          }],
        }),
      }, FASTINO_TIMEOUT_MS)

      if (!response.ok) return fallback(`http-${response.status}`, start)
      const data = await response.json()
      const classification = data?.output?.[0]?.classifications?.[0]
      const label: string = classification?.label ?? 'reasoning_or_code'
      const confidence: number = classification?.confidence ?? 0
      let tier = LABEL_TO_TIER[label] ?? 'medium'
      if (confidence < 0.6) tier = bumpUp(tier)

      return {
        tier,
        provider: TIER_TO_PROVIDER[tier],
        label,
        confidence,
        latencyMs: performance.now() - start,
        routed: true,
      }
    } catch (e) {
      return fallback(`exception:${(e as Error).name}`, start)
    }
  },
}

const fallback = (reason: string, start: number): RouteDecision => ({
  tier: 'medium',
  provider: 'gemma-local',
  label: `fallback:${reason}`,
  confidence: 0,
  latencyMs: performance.now() - start,
  routed: false,
})
