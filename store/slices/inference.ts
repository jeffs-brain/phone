import type { GenerationStatus, Slice } from '../types'

export type ModelId = 'gemma-4-E2B' | 'gemma-4-E4B'
export type ModelStatus =
  | 'unloaded'
  | 'checking'
  | 'downloading'
  | 'verifying'
  | 'loaded'
  | 'initialised'
  | 'ready'
  | 'error'

export type InferenceSlice = {
  modelId: ModelId | null
  modelStatus: ModelStatus
  modelError: string | null
  downloadBytes: { received: number; total: number } | null
  generationStatus: GenerationStatus
  abortController: AbortController | null
  loadModel: (id: ModelId) => Promise<void>
  unloadModel: () => Promise<void>
  cancelGeneration: () => void
  _setModelId: (id: ModelId | null) => void
  _setModelStatus: (status: ModelStatus) => void
  _setModelError: (error: string | null) => void
  _setDownloadBytes: (bytes: { received: number; total: number } | null) => void
  _setGenerationStatus: (status: GenerationStatus) => void
  _setAbortController: (ctrl: AbortController | null) => void
}

export const createInferenceSlice: Slice<InferenceSlice> = (set, get) => ({
  modelId: null,
  modelStatus: 'unloaded',
  modelError: null,
  downloadBytes: null,
  generationStatus: 'idle',
  abortController: null,

  loadModel: async (id) => {
    const { inferenceService } = await import('../../services/inference')
    await inferenceService.loadModel(id)
  },
  unloadModel: async () => {
    const { inferenceService } = await import('../../services/inference')
    await inferenceService.unloadModel()
  },
  cancelGeneration: () => {
    get().abortController?.abort()
  },

  _setModelId: (modelId) => set({ modelId }, false, 'inference/_setModelId'),
  _setModelStatus: (modelStatus) => set({ modelStatus }, false, 'inference/_setModelStatus'),
  _setModelError: (modelError) => set({ modelError }, false, 'inference/_setModelError'),
  _setDownloadBytes: (downloadBytes) => set({ downloadBytes }, false, 'inference/_setDownloadBytes'),
  _setGenerationStatus: (generationStatus) => set({ generationStatus }, false, 'inference/_setGenerationStatus'),
  _setAbortController: (abortController) => set({ abortController }, false, 'inference/_setAbortController'),
})
