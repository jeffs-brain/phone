import Constants from 'expo-constants'

export const GRADIUM_STT_ENDPOINT = 'wss://api.gradium.ai/api/speech/asr'
export const GRADIUM_TTS_ENDPOINT = 'wss://api.gradium.ai/api/speech/tts'

export const GRADIUM_API_KEY =
  process.env.EXPO_PUBLIC_GRADIUM_API_KEY ?? Constants.expoConfig?.extra?.gradiumApiKey

export const VOICE_CAPTURE = {
  INPUT_SAMPLE_RATE: 48000,
  TARGET_SAMPLE_RATE: 24000,
  CHANNELS: 1,
  FRAME_INTERVAL_MS: 80,
  VAD_INACTIVITY_THRESHOLD: 0.8,
  MIN_AUTO_END_MS: 900,
  FLUSH_TIMEOUT_MS: 7000,
  CONNECT_TIMEOUT_MS: 8000,
} as const

export const GRADIUM_VOICES = {
  EMMA: 'YTpq7expH9539ERJ',
  KENT: 'LFZvm12tW_z0xfGo',
  JACK: 'm86j6D7UZpGzHsNu',
} as const

export const DEFAULT_GRADIUM_TTS_VOICE_ID = GRADIUM_VOICES.JACK

export const TTS_PLAYBACK = {
  SAMPLE_RATE: 24000,
  CHANNELS: 1,
  MAX_CHARS: 1400,
  FINISH_PADDING_MS: 1200,
} as const
