import Constants from 'expo-constants'

export const GRADIUM_STT_ENDPOINT = 'wss://api.gradium.ai/api/speech/asr'
export const GRADIUM_TTS_ENDPOINT = 'wss://api.gradium.ai/api/speech/tts'

export const GRADIUM_API_KEY =
  process.env.EXPO_PUBLIC_GRADIUM_API_KEY ?? Constants.expoConfig?.extra?.gradiumApiKey

const configString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined

export const LIVEKIT_TOKEN_ENDPOINT = configString(
  process.env.EXPO_PUBLIC_LIVEKIT_TOKEN_ENDPOINT ?? Constants.expoConfig?.extra?.livekitTokenEndpoint,
)

export const isLocalLiveKitTokenEndpoint = (endpoint = LIVEKIT_TOKEN_ENDPOINT): boolean => {
  if (endpoint === undefined) return false
  try {
    const host = new URL(endpoint).hostname.toLowerCase()
    return host === 'localhost' || host === '127.0.0.1' || host === '::1'
  } catch {
    return false
  }
}

export const liveKitTokenEndpointStatus = (): 'missing' | 'local-device-unreachable' | 'configured' => {
  if (LIVEKIT_TOKEN_ENDPOINT === undefined) return 'missing'
  if (isLocalLiveKitTokenEndpoint()) return 'local-device-unreachable'
  return 'configured'
}

export const liveKitTokenEndpointError = (): string | null => {
  const status = liveKitTokenEndpointStatus()
  if (status === 'missing') {
    return 'LiveKit ai-coustics needs EXPO_PUBLIC_LIVEKIT_TOKEN_ENDPOINT in .env. Start backend/livekit-token and expose it with a URL this iPad can reach.'
  }
  if (status === 'local-device-unreachable') {
    return 'LiveKit token endpoint points at localhost. On a physical iPad, localhost is the iPad; use a tunnel or reachable Mac LAN URL.'
  }
  return null
}

export const LIVEKIT_VOICE = {
  CONNECT_TIMEOUT_MS: 10000,
  FINAL_TRANSCRIPT_TIMEOUT_MS: 8000,
  SPEECH_DONE_TIMEOUT_MS: 90000,
} as const

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
