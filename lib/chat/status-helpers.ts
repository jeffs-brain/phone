import { colors } from '../theme'
import type { ModelStatus } from '../../store/slices/inference'
import type { VoiceStatus } from '../../store/slices/voice'
import type { GenerationStatus, ProviderId } from '../../store/types'

const ACTIVE_GENERATION_STATUSES: readonly GenerationStatus[] = [
  'routing',
  'preparing-vision',
  'loading-first-token',
  'thinking',
  'using-tools',
  'streaming',
]

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  'gemma-local': 'On-device Gemma',
  'apple-fm': 'Apple Foundation',
  cloud: 'Cloud',
}

export const MODEL_STATUS_LABELS: Record<ModelStatus, string> = {
  unloaded: 'Model unloaded',
  checking: 'Checking model',
  downloading: 'Downloading model',
  verifying: 'Verifying model',
  loaded: 'Model downloaded',
  initialised: 'Initialising model',
  ready: 'Model ready',
  error: 'Model error',
}

export const GENERATION_STATUS_LABELS: Record<GenerationStatus, string> = {
  idle: 'Idle',
  routing: '\u{1F500} Routing',
  'preparing-vision': 'Preparing vision',
  'loading-first-token': 'Loading first token',
  thinking: '\u{1F914} Thinking',
  'using-tools': '\u{1F527} Using tools',
  streaming: '\u26A1 Streaming',
  done: 'Done',
  error: 'Generation error',
}

export const VOICE_STATUS_LABELS: Record<VoiceStatus, string> = {
  idle: 'Voice ready',
  'requesting-permission': 'Requesting mic',
  connecting: 'Connecting to Gradium',
  listening: '\u{1F442} Listening',
  'ending-turn': 'Ending turn',
  transcribing: '\u270D\uFE0F Transcribing',
  sending: 'Sending to Jeff',
  speaking: '\u{1F50A} Speaking',
  error: 'Voice error',
}

export const VOICE_BUSY_STATUSES: readonly VoiceStatus[] = [
  'requesting-permission',
  'connecting',
  'listening',
  'ending-turn',
  'transcribing',
  'sending',
]

const MODEL_ACTIVITY_STATUSES: readonly ModelStatus[] = [
  'checking',
  'downloading',
  'verifying',
  'loaded',
  'initialised',
]

export const STATUS_DOT_COLOURS: Record<ModelStatus, string> = {
  ready: colors.accent.success,
  downloading: colors.accent.warning,
  checking: colors.accent.warning,
  verifying: colors.accent.warning,
  loaded: colors.accent.warning,
  initialised: colors.accent.warning,
  error: colors.accent.error,
  unloaded: colors.text.muted,
}

export const isGenerationActive = (status: GenerationStatus): boolean => (
  ACTIVE_GENERATION_STATUSES.includes(status)
)

export const isModelActivityStatus = (status: ModelStatus): boolean => (
  MODEL_ACTIVITY_STATUSES.includes(status)
)
