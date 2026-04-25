import { INFERENCE_CONFIG } from '../constants'
import type { MemoryNotesStatus } from '../../store/slices/memory'
import type { ModelId, ModelStatus } from '../../store/slices/inference'
import type { GenerationStatus, ProviderId } from '../../store/types'

export type SettingsOption<T extends string> = {
  readonly value: T
  readonly label: string
  readonly detail: string
}

export const MODEL_OPTIONS = [
  { value: 'gemma-4-E2B', label: 'Gemma 4 E2B', detail: 'Simulator and fallback model' },
  { value: 'gemma-4-E4B', label: 'Gemma 4 E4B', detail: 'Primary iPhone demo model' },
] as const satisfies readonly SettingsOption<ModelId>[]

export const PROVIDER_OPTIONS = [
  { value: 'gemma-local', label: 'Local Gemma', detail: 'Default private path' },
  { value: 'apple-fm', label: 'Apple FM', detail: 'Planned iOS 26 provider' },
  { value: 'cloud', label: 'Cloud', detail: 'OpenAI-compatible large-tier fallback' },
] as const satisfies readonly SettingsOption<ProviderId>[]

export const BUSY_MODEL_STATUSES: readonly ModelStatus[] = [
  'checking',
  'downloading',
  'verifying',
  'loaded',
  'initialised',
]

export const ACTIVE_GENERATION_STATUSES: readonly GenerationStatus[] = [
  'routing',
  'preparing-vision',
  'loading-first-token',
  'thinking',
  'using-tools',
  'streaming',
]

export const modelLabel = (id: ModelId): string =>
  MODEL_OPTIONS.find((option) => option.value === id)?.label ?? id

export const formatStatusValue = (status: ModelStatus | GenerationStatus): string =>
  status.replace(/-/g, ' ')

export const memoryStatusCopy = (status: MemoryNotesStatus, count: number): string => {
  if (status === 'loading') return count === 0 ? 'Loading stored memories' : 'Refreshing stored memories'
  if (count === 0) return 'No durable memories stored yet'
  return `${count} stored memor${count === 1 ? 'y' : 'ies'} on this phone`
}

export const runtimeProfileLabel = (): string =>
  INFERENCE_CONFIG.PROFILE === 'simulator' ? 'Simulator' : 'Device'

export const simulatorMultimodalDetail = (): string => {
  if (INFERENCE_CONFIG.PROFILE !== 'simulator') {
    return 'Real devices use the Metal projector for multimodal turns.'
  }
  if (INFERENCE_CONFIG.PROFILE === 'simulator' && INFERENCE_CONFIG.MULTIMODAL_USE_GPU) {
    return 'Simulator multimodal GPU is enabled with EXPO_PUBLIC_SIMULATOR_MULTIMODAL_GPU.'
  }
  return 'Simulator multimodal uses the CPU projector unless EXPO_PUBLIC_SIMULATOR_MULTIMODAL_GPU is enabled.'
}

export const modelActionLabel = (modelStatus: ModelStatus): string => {
  if (modelStatus === 'error') return '🔄 Retry'
  if (BUSY_MODEL_STATUSES.includes(modelStatus)) return '⏳ Working...'
  if (modelStatus === 'ready') return '🔄 Reload'
  return '📦 Load model'
}

export const friendlyModelError = (error: string): string => {
  const normalised = error.toLowerCase()
  if (normalised.includes('http 404')) return 'Model asset URL was not found. Check the configured GGUF URL.'
  if (normalised.includes('sha-256') || normalised.includes('checksum')) {
    return 'Cached model verification failed. Retry to repair the local file.'
  }
  if (normalised.includes('free') && normalised.includes('available')) {
    return 'There is not enough simulator storage for this model.'
  }
  if (normalised.includes('simulator projector gpu')) {
    return 'Simulator projector GPU crashed. CPU vision fallback is enabled for this install.'
  }
  if (normalised.includes('projector') || normalised.includes('initialise')) {
    return 'Native model initialisation failed. Try Gemma 4 E2B on the simulator.'
  }
  return error
}
