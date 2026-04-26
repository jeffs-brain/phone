import Constants from 'expo-constants'

import { ROUTING } from '../lib/constants'
import type { ProviderId, RouteDecision, Tier } from '../store/types'

type JsonRecord = Record<string, unknown>
type RoutingLabel = typeof ROUTING_LABELS[number]
type ParsedClassification = {
  readonly label: RoutingLabel
  readonly confidence: number
}

const extra = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined

const envValue = (key: string): string | undefined => process.env[key] ?? extra?.[key]

const FASTINO_ENDPOINT =
  envValue('EXPO_PUBLIC_FASTINO_ENDPOINT')?.trim() ?? 'https://api.pioneer.ai/v1/chat/completions'
const FASTINO_API_KEY = envValue('EXPO_PUBLIC_FASTINO_API_KEY')?.trim()
const FASTINO_MODEL_ID = envValue('EXPO_PUBLIC_FASTINO_MODEL_ID')?.trim() ?? 'fastino/gliner2-base-v1'
const FASTINO_TASK = 'provider_route'
const ROUTING_LABELS = [
  'trivial_chat',
  'factual_qa',
  'reasoning_or_code',
  'long_context_or_creative',
] as const
const DEFAULT_LABEL: RoutingLabel = 'reasoning_or_code'

const LABEL_TO_TIER: Record<RoutingLabel, Tier> = {
  trivial_chat: 'small',
  factual_qa: 'small',
  reasoning_or_code: 'medium',
  long_context_or_creative: 'large',
}

const TIER_TO_PROVIDER: Record<Tier, ProviderId> = {
  small: 'gemma-local',
  medium: 'gemma-local',
  large: 'cloud',
}

const bumpUp = (t: Tier): Tier => (t === 'small' ? 'medium' : 'large')

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const recordArray = (value: unknown): JsonRecord[] =>
  Array.isArray(value) ? value.filter(isRecord) : []

const isRoutingLabel = (value: unknown): value is RoutingLabel =>
  typeof value === 'string' && ROUTING_LABELS.includes(value as RoutingLabel)

const labelFromValue = (value: unknown): RoutingLabel | null => {
  if (isRoutingLabel(value)) return value
  if (Array.isArray(value)) {
    for (const item of value) {
      if (isRoutingLabel(item)) return item
    }
  }
  return null
}

const numberFromValue = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

const responseRecords = (data: unknown): JsonRecord[] => {
  if (!isRecord(data)) return []
  return [
    data,
    ...recordArray(data.output),
    ...recordArray(data.outputs),
    ...recordArray(data.results),
    ...recordArray(data.data),
  ]
}

const probabilityFor = (
  probabilities: JsonRecord | null,
  task: string,
  label: RoutingLabel,
): number | null => {
  if (probabilities === null) return null
  const taskScores = probabilities[task]
  if (isRecord(taskScores)) return numberFromValue(taskScores[label])
  return numberFromValue(probabilities[label])
}

const parseDocumentedClassification = (records: readonly JsonRecord[]): ParsedClassification | null => {
  const taskKeys = [FASTINO_TASK, 'intent', 'route', 'routing']

  for (const record of records) {
    const prediction = isRecord(record.prediction) ? record.prediction : null
    if (prediction === null) continue

    for (const task of taskKeys) {
      const label = labelFromValue(prediction[task])
      if (label === null) continue
      const probabilities = isRecord(record.probabilities) ? record.probabilities : null
      return {
        label,
        confidence: probabilityFor(probabilities, task, label) ?? 0,
      }
    }
  }

  return null
}

const parseLegacyClassification = (records: readonly JsonRecord[]): ParsedClassification | null => {
  for (const record of records) {
    for (const classification of recordArray(record.classifications)) {
      const label = labelFromValue(classification.label)
      if (label === null) continue
      return {
        label,
        confidence: numberFromValue(classification.confidence) ?? numberFromValue(classification.score) ?? 0,
      }
    }
  }

  return null
}

const parsedJson = (value: string): unknown => {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

const parsePioneerClassification = (data: unknown): ParsedClassification | null => {
  if (!isRecord(data)) return null
  const choice = recordArray(data.choices)[0]
  if (choice === undefined) return null
  const message = isRecord(choice.message) ? choice.message : null
  const content = message?.content
  const parsed = typeof content === 'string' ? parsedJson(content) : content
  if (!isRecord(parsed)) return null

  const taskResult = parsed[FASTINO_TASK]
  if (isRecord(taskResult)) {
    const label = labelFromValue(taskResult.label)
    if (label === null) return null
    return {
      label,
      confidence: numberFromValue(taskResult.confidence) ?? numberFromValue(taskResult.score) ?? 0,
    }
  }

  const label = labelFromValue(taskResult)
  if (label === null) return null
  return {
    label,
    confidence: 0,
  }
}

const parseFastinoClassification = (data: unknown): ParsedClassification | null => {
  const records = responseRecords(data)
  return parsePioneerClassification(data)
    ?? parseDocumentedClassification(records)
    ?? parseLegacyClassification(records)
}

const fetchWithTimeout = (
  url: string,
  init: RequestInit,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<Response> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const abort = (): void => controller.abort()
  if (signal?.aborted === true) controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  return fetch(url, { ...init, signal: controller.signal }).finally(() => {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  })
}

export const routerService = {
  localOnly(reason: string): RouteDecision {
    return {
      tier: 'medium',
      provider: 'gemma-local',
      label: `local-only:${reason}`,
      confidence: 1,
      latencyMs: 0,
      routed: false,
    }
  },

  manual(provider: ProviderId): RouteDecision {
    return {
      tier: provider === 'cloud' ? 'large' : 'medium',
      provider,
      label: 'manual',
      confidence: 1,
      latencyMs: 0,
      routed: false,
    }
  },

  async classify(
    message: string,
    history: string[],
    fallbackProvider: ProviderId,
    signal?: AbortSignal,
  ): Promise<RouteDecision> {
    const start = performance.now()
    if (!FASTINO_API_KEY) {
      return fallback('missing-key', start, fallbackProvider)
    }
    if (!FASTINO_MODEL_ID) {
      return fallback('missing-model', start, fallbackProvider)
    }

    try {
      const ctx = history.slice(-3).join('\n')
      const response = await fetchWithTimeout(FASTINO_ENDPOINT, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${FASTINO_API_KEY}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: FASTINO_MODEL_ID,
          messages: [{
            role: 'user',
            content: `${ctx}\n\nuser: ${message}`,
          }],
          schema: {
            classifications: [{
              task: FASTINO_TASK,
              labels: ROUTING_LABELS,
            }],
          },
          include_confidence: true,
        }),
      }, ROUTING.FASTINO_TIMEOUT_MS, signal)

      if (!response.ok) return fallback(`http-${response.status}`, start, fallbackProvider)
      const data = await response.json()
      const classification = parseFastinoClassification(data)
      if (classification === null) return fallback('unparseable-response', start, fallbackProvider)

      const { label, confidence } = classification
      let tier = LABEL_TO_TIER[label] ?? LABEL_TO_TIER[DEFAULT_LABEL]
      if (confidence < ROUTING.CONFIDENCE_BUMP_THRESHOLD) tier = bumpUp(tier)

      return {
        tier,
        provider: TIER_TO_PROVIDER[tier],
        label,
        confidence,
        latencyMs: performance.now() - start,
        routed: true,
      }
    } catch (e) {
      const name = e instanceof Error ? e.name : 'unknown'
      return fallback(`exception:${name}`, start, fallbackProvider)
    }
  },
}

const fallback = (reason: string, start: number, provider: ProviderId): RouteDecision => ({
  tier: provider === 'cloud' ? 'large' : 'medium',
  provider,
  label: `fallback:${reason}`,
  confidence: 0,
  latencyMs: performance.now() - start,
  routed: false,
})
