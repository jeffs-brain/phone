import type { GenerationStatus, Slice } from '../types'

export type ModelId = 'gemma-4-E2B' | 'gemma-4-E4B'
export type ModelStatus = 'unloaded' | 'downloading' | 'loaded' | 'initialised' | 'ready' | 'error'

export type InferenceSlice = {
  modelId: ModelId | null
  modelStatus: ModelStatus
  downloadBytes: { received: number; total: number } | null
  generationStatus: GenerationStatus
  abortController: AbortController | null
  loadModel: (id: ModelId) => Promise<void>
  unloadModel: () => Promise<void>
  cancelGeneration: () => void
  _setModelStatus: (status: ModelStatus) => void
  _setDownloadBytes: (bytes: { received: number; total: number } | null) => void
  _setGenerationStatus: (status: GenerationStatus) => void
  _setAbortController: (ctrl: AbortController | null) => void
}

export const createInferenceSlice: Slice<InferenceSlice> = (set, get) => ({
  modelId: null,
  modelStatus: 'unloaded',
  downloadBytes: null,
  generationStatus: 'idle',
  abortController: null,

  loadModel: async (_id) => {
    // Delegates to services/inference.loadModel
  },
  unloadModel: async () => {
    // Delegates to services/inference.unloadModel
  },
  cancelGeneration: () => {
    get().abortController?.abort()
  },

  _setModelStatus: (modelStatus) => set({ modelStatus }, false, 'inference/_setModelStatus'),
  _setDownloadBytes: (downloadBytes) => set({ downloadBytes }, false, 'inference/_setDownloadBytes'),
  _setGenerationStatus: (generationStatus) => set({ generationStatus }, false, 'inference/_setGenerationStatus'),
  _setAbortController: (abortController) => set({ abortController }, false, 'inference/_setAbortController'),
})
