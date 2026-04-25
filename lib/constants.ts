import { Platform } from 'react-native'

export const INFERENCE_CONFIG = {
  N_CTX: 4096,
  N_PREDICT_MAX: 512,
  N_BATCH: 512,
  N_UBATCH: 128,
  N_THREADS: Platform.OS === 'ios' ? 6 : 4,
  N_GPU_LAYERS: 99,
  N_PARALLEL: 4,
  IMAGE_MAX_TOKENS: 512,
  CTX_SHIFT: false as const,
  FLASH_ATTN_TYPE: 'auto' as const,
} as const

export const TOOL_LIMITS = {
  MAX_ROUNDS: 3,
} as const

export const MEMORY_PRECONTEXT = {
  TOP_K: 3,
  SNIPPET_MAX_CHARS: 420,
} as const

export const STREAMING = {
  // Hard cap chunk size so a single rAF flush can't dominate a frame
  MAX_CHUNK_PER_FLUSH: 2048,
} as const

export const ROUTING = {
  FASTINO_TIMEOUT_MS: 250,
  CONFIDENCE_BUMP_THRESHOLD: 0.6,
} as const

export const BRAIN_ID = 'jeff'
