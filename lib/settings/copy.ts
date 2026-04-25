import { INFERENCE_CONFIG } from '../constants'
import type { RuntimeDiagnostics } from '../../services/inference'
import type { MemoryNotesStatus } from '../../store/slices/memory'
import type { ModelId, ModelStatus } from '../../store/slices/inference'
import type { GenerationStatus, ProviderId } from '../../store/types'

export type SettingsOption<T extends string> = {
  readonly value: T
  readonly label: string
  readonly detail: string
}

export const MODEL_OPTIONS = [
  { value: 'gemma-4-E2B', label: 'Gemma 4 E2B', detail: 'Fast demo model; safest on simulator' },
  { value: 'gemma-4-E4B', label: 'Gemma 4 E4B', detail: 'Larger iPhone demo model' },
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
  'checking-vision',
  'downloading-vision',
  'verifying-vision',
  'initialising-vision',
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

export const runtimeProfileLabel = (diagnostics?: RuntimeDiagnostics): string =>
  (diagnostics?.profile ?? INFERENCE_CONFIG.PROFILE) === 'simulator' ? 'Simulator' : 'Device'

export type RuntimeDiagnosticCopy = {
  readonly value: string
  readonly detail: string
}

const deviceList = (devices: readonly string[]): string =>
  devices.length === 0 ? 'No backend device name was reported.' : `Backend: ${devices.join(', ')}.`

export const textGpuDiagnostic = (diagnostics: RuntimeDiagnostics): RuntimeDiagnosticCopy => {
  if (!diagnostics.modelLoaded) {
    return {
      value: 'Pending load',
      detail: `The next model load will request ${diagnostics.requestedGpuLayers} GPU layers.`,
    }
  }

  if (diagnostics.textGpuActive === true) {
    return {
      value: 'Active',
      detail: `Metal offload is active for the loaded text context. ${deviceList(diagnostics.devices)}`,
    }
  }

  return {
    value: 'CPU',
    detail: diagnostics.reasonNoGpu
      ?? `llama.rn reported no GPU after requesting ${diagnostics.requestedGpuLayers} GPU layers.`,
  }
}

export const visionGpuDiagnostic = (
  diagnostics: RuntimeDiagnostics,
  projectorAutoDisabled: boolean | null,
): RuntimeDiagnosticCopy => {
  if (projectorAutoDisabled) {
    return {
      value: 'CPU guarded',
      detail: diagnostics.profile === 'simulator'
        ? 'Simulator projector GPU was auto-disabled after a previous crash.'
        : 'Projector GPU was auto-disabled after a previous crash. Text Metal can still be active.',
    }
  }

  if (diagnostics.profile === 'simulator') {
    return {
      value: diagnostics.multimodalGpuConfigured ? 'GPU requested' : 'CPU/default',
      detail: diagnostics.multimodalGpuConfigured
        ? 'Simulator projector GPU is env-enabled, but iOS Simulator Metal is still expected to be unstable for this path.'
        : 'Simulator vision uses the CPU projector unless EXPO_PUBLIC_SIMULATOR_MULTIMODAL_GPU is enabled.',
    }
  }

  if (!diagnostics.modelLoaded) {
    return {
      value: 'Pending load',
      detail: 'The vision projector will request GPU on the real device once an image turn needs it.',
    }
  }

  if (!diagnostics.multimodalReady) {
    return {
      value: diagnostics.textGpuActive === true ? 'Will request GPU' : 'CPU until Metal is active',
      detail: diagnostics.textGpuActive === true
        ? 'The loaded text context has Metal, so image turns will initialise the projector with GPU enabled.'
        : 'The projector cannot use GPU because the loaded text context did not get Metal.',
    }
  }

  return {
    value: diagnostics.multimodalGpuRequested === true ? 'GPU requested' : 'CPU',
    detail: diagnostics.multimodalGpuRequested === true
      ? 'The current loaded projector was initialised with use_gpu enabled.'
      : 'The current loaded projector was initialised without GPU.',
  }
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
    return 'There is not enough local storage for this model.'
  }
  if (normalised.includes('simulator projector gpu')) {
    return 'Simulator projector GPU crashed. CPU vision fallback is enabled for this install.'
  }
  if (normalised.includes('projector') || normalised.includes('initialise')) {
    return 'Native model initialisation failed. Try Gemma 4 E2B, then reload.'
  }
  return error
}
