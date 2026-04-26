export const LIVEKIT_VOICE_TOPIC = 'jeff.voice'

export type LiveKitVoiceInboundEvent =
  | { readonly type: 'transcript_partial'; readonly text: string }
  | { readonly type: 'transcript_final'; readonly text: string }
  | { readonly type: 'speech_started' }
  | { readonly type: 'speech_done' }
  | { readonly type: 'error'; readonly message: string }

export type LiveKitVoiceOutboundEvent =
  | { readonly type: 'assistant_response'; readonly text: string }
  | { readonly type: 'stop_listening' }

export type LiveKitVoiceEvent = LiveKitVoiceInboundEvent | LiveKitVoiceOutboundEvent

type JsonRecord = Record<string, unknown>

const encoder = new TextEncoder()
const decoder = new TextDecoder()

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const stringValue = (record: JsonRecord, key: string): string | null =>
  typeof record[key] === 'string' ? record[key] : null

export const encodeLiveKitVoiceEvent = (event: LiveKitVoiceOutboundEvent): Uint8Array =>
  encoder.encode(JSON.stringify(event))

export const decodeLiveKitVoiceEvent = (payload: Uint8Array): LiveKitVoiceInboundEvent | null => {
  let parsed: unknown
  try {
    parsed = JSON.parse(decoder.decode(payload))
  } catch {
    return null
  }

  if (!isRecord(parsed)) return null
  const type = stringValue(parsed, 'type')

  if (type === 'transcript_partial' || type === 'transcript_final') {
    const text = stringValue(parsed, 'text')
    return text === null ? null : { type, text }
  }

  if (type === 'speech_started' || type === 'speech_done') {
    return { type }
  }

  if (type === 'error') {
    const message = stringValue(parsed, 'message')
    return message === null ? null : { type, message }
  }

  return null
}
