import { colors } from '../theme'
import {
  ACTIVE_GENERATION_STATUSES,
  isGenerationActive,
  isModelActivityStatus,
} from '../runtime-status'
import type { ModelStatus } from '../../store/slices/inference'
import type { VoiceStatus } from '../../store/slices/voice'
import type { GenerationStatus, ProviderId } from '../../store/types'

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
  'checking-vision': 'Checking vision',
  'downloading-vision': 'Downloading vision',
  'verifying-vision': 'Verifying vision',
  'initialising-vision': 'Initialising vision',
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

export { ACTIVE_GENERATION_STATUSES, isGenerationActive, isModelActivityStatus }
