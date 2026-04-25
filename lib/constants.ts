import { Platform } from 'react-native'

export type LlamaRuntimeProfile = 'device' | 'simulator'

const requestedLlamaProfile = process.env.EXPO_PUBLIC_LLAMA_PROFILE
export const LLAMA_RUNTIME_PROFILE: LlamaRuntimeProfile =
  requestedLlamaProfile === 'simulator' ? 'simulator' : 'device'

const isSimulatorProfile = LLAMA_RUNTIME_PROFILE === 'simulator'
const enabledEnvValues = new Set(['enabled', 'true', '1', 'yes', 'on'])
const disabledEnvValues = new Set(['disabled', 'false', '0', 'no', 'off'])

const envFlag = (value: string | undefined, fallback: boolean): boolean => {
  const normalised = value?.trim().toLowerCase()
  if (normalised === undefined || normalised === '') return fallback
  if (enabledEnvValues.has(normalised)) return true
  if (disabledEnvValues.has(normalised)) return false
  return fallback
}

const simulatorVisionEnabled = envFlag(process.env.EXPO_PUBLIC_SIMULATOR_VISION, true)
const simulatorMultimodalGpuEnabled = envFlag(process.env.EXPO_PUBLIC_SIMULATOR_MULTIMODAL_GPU, false)

export const INFERENCE_CONFIG = {
  PROFILE: LLAMA_RUNTIME_PROFILE,
  N_CTX: isSimulatorProfile ? 2048 : 4096,
  N_PREDICT_MAX: isSimulatorProfile ? 256 : 512,
  N_BATCH: 512,
  N_UBATCH: 512,
  N_THREADS: Platform.OS === 'ios' ? (isSimulatorProfile ? 4 : 6) : 4,
  N_GPU_LAYERS: 99,
  N_PARALLEL: 1,
  IMAGE_MAX_TOKENS: isSimulatorProfile ? 256 : 512,
  MULTIMODAL_GENERATION_ENABLED: !isSimulatorProfile || simulatorVisionEnabled,
  MULTIMODAL_USE_GPU: !isSimulatorProfile || simulatorMultimodalGpuEnabled,
  THINKING_BUDGET_TOKENS: isSimulatorProfile ? 32 : 64,
  THINKING_BUDGET_MESSAGE: '\n\nThinking budget reached; answer now.',
  CTX_SHIFT: false as const,
  FLASH_ATTN_TYPE: 'auto' as const,
} as const

export const GEMMA_STOPS = [
  '<end_of_turn>',
  '<|end_of_turn|>',
  '<|eot_id|>',
  '<|im_end|>',
  '<|endoftext|>',
] as const

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

export const SYSTEM_PROMPT = [
  'You are Jeff, Alex Jay\'s private on-device brain.',
  'Be direct, useful, and concise.',
  'Keep reasoning in the hidden thinking channel only.',
  'Visible answers must not contain thought tags, channel markers, or scratchpad text.',
  'Use remembered facts only when they are relevant.',
  'Use memory_recall only when stored context would materially help answer the current user.',
  'Use memory_remember only for explicit remember requests or clearly durable high-confidence user facts, preferences, plans, or feedback.',
  'Never save greetings, one-off small talk, temporary state, or facts that will not matter later.',
  'Use memory_list and memory_forget only when the user asks to inspect or delete memories.',
  'Never claim private data left the phone unless the selected provider is cloud.',
].join('\n')
