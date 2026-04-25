import {
  DEFAULT_GRADIUM_TTS_VOICE_ID,
  GRADIUM_TTS_ENDPOINT,
  VOICE_CAPTURE,
} from './config'

type ReactNativeWebSocketConstructor = new (
  url: string,
  protocols?: readonly string[] | string | null,
  options?: { readonly headers?: Record<string, string> },
) => WebSocket

type ReadyMessage = {
  readonly type: 'ready'
  readonly request_id: string
}

type AudioMessage = {
  readonly type: 'audio'
  readonly audio: string
}

type TextMessage = {
  readonly type: 'text'
  readonly text: string
}

type ErrorMessage = {
  readonly type: 'error'
  readonly message: string
  readonly code?: number
}

type EndMessage = {
  readonly type: 'end_of_stream'
}

type GradiumTtsMessage = ReadyMessage | AudioMessage | TextMessage | ErrorMessage | EndMessage

export type GradiumTtsCallbacks = {
  readonly onReady: (message: ReadyMessage) => void
  readonly onAudio: (base64Pcm: string) => void
  readonly onText?: (text: string) => void
  readonly onError?: (error: Error) => void
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const stringField = (record: Record<string, unknown>, key: string): string | null => {
  const value = record[key]
  return typeof value === 'string' ? value : null
}

const numberField = (record: Record<string, unknown>, key: string): number | undefined => {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

const parseMessage = (data: unknown): GradiumTtsMessage | null => {
  if (typeof data !== 'string') return null

  const parsed: unknown = JSON.parse(data)
  if (!isRecord(parsed)) return null

  const type = stringField(parsed, 'type')
  if (type === 'ready') {
    return { type, request_id: stringField(parsed, 'request_id') ?? 'unknown' }
  }

  if (type === 'audio') {
    return { type, audio: stringField(parsed, 'audio') ?? '' }
  }

  if (type === 'text') {
    return { type, text: stringField(parsed, 'text') ?? '' }
  }

  if (type === 'error') {
    return {
      type,
      message: stringField(parsed, 'message') ?? 'Gradium TTS error',
      code: numberField(parsed, 'code'),
    }
  }

  if (type === 'end_of_stream') return { type }
  return null
}

export class GradiumTtsClient {
  private socket: WebSocket | null = null
  private closed = false

  constructor(
    private readonly apiKey: string,
    private readonly callbacks: GradiumTtsCallbacks,
    private readonly voiceId: string = DEFAULT_GRADIUM_TTS_VOICE_ID,
  ) {}

  async speak(text: string, signal?: AbortSignal): Promise<void> {
    const cleanText = text.trim()
    if (cleanText === '') return

    const Socket = WebSocket as unknown as ReactNativeWebSocketConstructor
    const socket = new Socket(GRADIUM_TTS_ENDPOINT, null, {
      headers: { 'x-api-key': this.apiKey },
    })
    this.socket = socket
    this.closed = false

    await new Promise<void>((resolve, reject) => {
      let settled = false
      let ready = false
      const timer = setTimeout(() => {
        finish(new Error('Gradium TTS connection timed out.'))
      }, VOICE_CAPTURE.CONNECT_TIMEOUT_MS)

      const finish = (error?: Error): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        signal?.removeEventListener('abort', abort)
        if (error === undefined) resolve()
        else reject(error)
      }

      const abort = (): void => {
        this.close()
        finish(new Error('Speech cancelled.'))
      }

      signal?.addEventListener('abort', abort, { once: true })

      socket.onopen = () => {
        socket.send(JSON.stringify({
          type: 'setup',
          model_name: 'default',
          voice_id: this.voiceId,
          output_format: 'pcm_24000',
        }))
      }

      socket.onerror = () => {
        finish(new Error('Gradium TTS connection failed.'))
      }

      socket.onclose = () => {
        finish(ready ? undefined : new Error('Gradium TTS connection closed before it was ready.'))
      }

      socket.onmessage = (event) => {
        if (this.closed) return

        try {
          const message = parseMessage(event.data)
          if (message === null) return

          if (message.type === 'ready') {
            ready = true
            this.callbacks.onReady(message)
            socket.send(JSON.stringify({ type: 'text', text: cleanText }))
            socket.send(JSON.stringify({ type: 'end_of_stream' }))
            return
          }

          if (message.type === 'audio') {
            if (message.audio !== '') this.callbacks.onAudio(message.audio)
            return
          }

          if (message.type === 'text') {
            this.callbacks.onText?.(message.text)
            return
          }

          if (message.type === 'end_of_stream') {
            finish()
            return
          }

          const suffix = message.code === undefined ? '' : ` (${message.code})`
          const error = new Error(`${message.message}${suffix}`)
          this.callbacks.onError?.(error)
          finish(error)
        } catch (error) {
          finish(error instanceof Error ? error : new Error('Invalid Gradium TTS message.'))
        }
      }
    }).finally(() => {
      this.close()
    })
  }

  close(): void {
    this.closed = true
    if (this.socket?.readyState === WebSocket.OPEN || this.socket?.readyState === WebSocket.CONNECTING) {
      this.socket.close()
    }
    this.socket = null
  }
}
