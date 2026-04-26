import AsyncStorage from '@react-native-async-storage/async-storage'

import type { ModelId } from '../store/slices/inference'

const RUNTIME_MARKER_KEY = 'jeff-phone:runtime-marker'
const SIMULATOR_MULTIMODAL_GPU_AUTO_DISABLED_KEY = 'jeff-phone:simulator-multimodal-gpu-auto-disabled'
const MULTIMODAL_GPU_AUTO_DISABLED_KEY = 'jeff-phone:multimodal-gpu-auto-disabled'
const GEMMA_VISION_AUTO_DISABLED_KEY = 'jeff-phone:gemma-vision-auto-disabled'

export type RuntimeMarkerStage = 'model-load' | 'projector-load' | 'generation'

export type RuntimeMarker = {
  readonly modelId: ModelId
  readonly stage: RuntimeMarkerStage
  readonly updatedAt: number
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isModelId = (value: unknown): value is ModelId => value === 'gemma-4-E2B' || value === 'gemma-4-E4B'

const isRuntimeMarkerStage = (value: unknown): value is RuntimeMarkerStage =>
  value === 'model-load' || value === 'projector-load' || value === 'generation'

export const writeRuntimeMarker = async (marker: Omit<RuntimeMarker, 'updatedAt'>): Promise<void> => {
  await AsyncStorage.setItem(RUNTIME_MARKER_KEY, JSON.stringify({ ...marker, updatedAt: Date.now() }))
}

export const clearRuntimeMarker = async (): Promise<void> => {
  await AsyncStorage.removeItem(RUNTIME_MARKER_KEY)
}

export const disableMultimodalGpu = async (): Promise<void> => {
  await AsyncStorage.setItem(MULTIMODAL_GPU_AUTO_DISABLED_KEY, 'true')
}

export const disableGemmaVision = async (): Promise<void> => {
  await AsyncStorage.setItem(GEMMA_VISION_AUTO_DISABLED_KEY, 'true')
}

export const isMultimodalGpuAutoDisabled = async (): Promise<boolean> =>
  (await AsyncStorage.getItem(MULTIMODAL_GPU_AUTO_DISABLED_KEY)) === 'true' ||
  (await AsyncStorage.getItem(SIMULATOR_MULTIMODAL_GPU_AUTO_DISABLED_KEY)) === 'true'

export const isGemmaVisionAutoDisabled = async (): Promise<boolean> =>
  (await AsyncStorage.getItem(GEMMA_VISION_AUTO_DISABLED_KEY)) === 'true'

export const clearMultimodalGpuAutoDisable = async (): Promise<void> => {
  await AsyncStorage.removeItem(MULTIMODAL_GPU_AUTO_DISABLED_KEY)
  await AsyncStorage.removeItem(SIMULATOR_MULTIMODAL_GPU_AUTO_DISABLED_KEY)
  await AsyncStorage.removeItem(GEMMA_VISION_AUTO_DISABLED_KEY)
}

export const disableSimulatorMultimodalGpu = disableMultimodalGpu
export const isSimulatorMultimodalGpuAutoDisabled = isMultimodalGpuAutoDisabled
export const clearSimulatorMultimodalGpuAutoDisable = clearMultimodalGpuAutoDisable

export const readRuntimeMarker = async (): Promise<RuntimeMarker | null> => {
  const raw = await AsyncStorage.getItem(RUNTIME_MARKER_KEY)
  if (raw === null) return null

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return null
    if (!isModelId(parsed.modelId) || !isRuntimeMarkerStage(parsed.stage)) return null
    if (typeof parsed.updatedAt !== 'number') return null
    return {
      modelId: parsed.modelId,
      stage: parsed.stage,
      updatedAt: parsed.updatedAt,
    }
  } catch {
    return null
  }
}

export const describeRuntimeMarker = (marker: RuntimeMarker): string => {
  if (marker.stage === 'projector-load') {
    return 'The app previously stopped while loading the multimodal projector. Local Gemma vision has been disabled for this install.'
  }
  if (marker.stage === 'generation') {
    return 'The app previously stopped during local generation. Retry with a shorter prompt or the smaller model.'
  }
  return 'The app previously stopped while initialising the local model. Retry, or switch to Gemma 4 E2B.'
}
