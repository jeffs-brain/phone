import type { ModelStatus } from '../store/slices/inference'
import type { GenerationStatus } from '../store/types'

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
] as const

export const BUSY_MODEL_STATUSES: readonly ModelStatus[] = [
  'checking',
  'downloading',
  'verifying',
  'loaded',
  'initialised',
] as const

export const isGenerationActive = (status: GenerationStatus): boolean =>
  ACTIVE_GENERATION_STATUSES.includes(status)

export const isModelActivityStatus = (status: ModelStatus): boolean =>
  BUSY_MODEL_STATUSES.includes(status)
