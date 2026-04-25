import {
  GRADIUM_STT_ENDPOINT,
  VOICE_CAPTURE,
} from './config'

type ReactNativeWebSocketConstructor = new (
  url: string,
  protocols?: readonly string[] | string | null,
  options?: { readonly headers?: Record<string, string> },
) => WebSocket

type VadPrediction = {
  readonly horizon_s: number
  readonly inactivity_prob: number
}

type ReadyMessage = {
  readonly type: 'ready'
  readonly request_id: string
  readonly sample_rate?: number
  readonly frame_size?: number
}

type TextMessage = {
  readonly type: 'text'
  readonly text: string
}

type StepMessage = {
  readonly type: 'step'
  readonly vad: readonly VadPrediction[]
}

type FlushedMessage = {
  readonly type: 'flushed'
  readonly flush_id: string
}

type ErrorMessage = {
  readonly type: 'error'
  readonly message: string
  readonly code?: number
}

type EndMessage = {
  readonly type: 'end_text' | 'end_of_stream'
}

type GradiumServerMessage = ReadyMessage | TextMessage | StepMessage | FlushedMessage | ErrorMessage | EndMessage

export type GradiumSttCallbacks = {
  readonly onReady: (message: ReadyMessage) => void
  readonly onText: (text: string) => void
  readonly onVad: (inactivity: number) => void
  readonly onFlushed: () => void
  readonly onError: (error: Error) => void
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

const parseVad = (value: unknown): readonly VadPrediction[] => {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!isRecord(item)) return []
    const horizon = numberField(item, 'horizon_s')
    const inactivity = numberField(item, 'inactivity_prob')
    if (horizon === undefined || inactivity === undefined) return []
    return [{ horizon_s: horizon, inactivity_prob: inactivity }]
  })
}

const parseMessage = (data: unknown): GradiumServerMessage | null => {
  if (typeof data !== 'string') return null

  const parsed: unknown = JSON.parse(data)
  if (!isRecord(parsed)) return null

  const type = stringField(parsed, 'type')
  if (type === 'ready') {
    return {
      type,
      request_id: stringField(parsed, 'request_id') ?? 'unknown',
      sample_rate: numberField(parsed, 'sample_rate'),
      frame_size: numberField(parsed, 'frame_size'),
    }
  }

  if (type === 'text') {
    return { type, text: stringField(parsed, 'text') ?? '' }
  }

  if (type === 'step') {
    return { type, vad: parseVad(parsed.vad) }
  }

  if (type === 'flushed') {
    return { type, flush_id: stringField(parsed, 'flush_id') ?? '' }
  }

  if (type === 'error') {
    return {
      type,
      message: stringField(parsed, 'message') ?? 'Gradium STT error',
      code: numberField(parsed, 'code'),
    }
  }

  if (type === 'end_text' || type === 'end_of_stream') {
    return { type }
  }

  return null
}

export class GradiumSttClient {
  private socket: WebSocket | null = null
  private ready = false
  private closed = false
  private flushId: string | null = null
  private flushSequence = 0
  private flushResolver: (() => void) | null = null
  private flushRejecter: ((error: Error) => void) | null = null
  private flushTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly apiKey: string,
    private readonly callbacks: GradiumSttCallbacks,
  ) {}

  async connect(): Promise<void> {
    if (this.socket !== null) return

    const Socket = WebSocket as unknown as ReactNativeWebSocketConstructor
    const socket = new Socket(GRADIUM_STT_ENDPOINT, null, {
      headers: { 'x-api-key': this.apiKey },
    })
    this.socket = socket

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Gradium STT connection timed out.'))
        this.close()
      }, VOICE_CAPTURE.CONNECT_TIMEOUT_MS)

      const resolveReady = (): void => {
        clearTimeout(timer)
        resolve()
      }

      const rejectConnect = (error: Error): void => {
        clearTimeout(timer)
        reject(error)
      }

      socket.onopen = () => {
        socket.send(JSON.stringify({
          type: 'setup',
          model_name: 'default',
          input_format: 'pcm',
        }))
      }

      socket.onerror = () => {
        const error = new Error('Gradium STT connection failed.')
        this.callbacks.onError(error)
        rejectConnect(error)
      }

      socket.onclose = () => {
        if (!this.ready && !this.closed) {
          rejectConnect(new Error('Gradium STT connection closed before it was ready.'))
        }
      }

      socket.onmessage = (event) => {
        try {
          const message = parseMessage(event.data)
          if (message === null) return
          this.handleMessage(message, resolveReady)
        } catch (error) {
          this.callbacks.onError(error instanceof Error ? error : new Error('Invalid Gradium STT message.'))
        }
      }
    })
  }

  sendAudioBase64(audio: string): void {
    if (!this.ready || this.socket?.readyState !== WebSocket.OPEN || this.flushId !== null) return
    this.socket.send(JSON.stringify({ type: 'audio', audio }))
  }

  async flush(): Promise<void> {
    if (this.socket?.readyState !== WebSocket.OPEN) return
    if (this.flushId !== null) return

    this.flushSequence += 1
    const flushId = String(this.flushSequence)
    this.flushId = flushId

    await new Promise<void>((resolve, reject) => {
      this.flushResolver = resolve
      this.flushRejecter = reject
      this.flushTimer = setTimeout(() => {
        this.flushId = null
        this.flushResolver = null
        this.flushRejecter = null
        reject(new Error('Gradium STT flush timed out.'))
      }, VOICE_CAPTURE.FLUSH_TIMEOUT_MS)

      this.socket?.send(JSON.stringify({ type: 'flush', flush_id: flushId }))
    })
  }

  close(): void {
    this.closed = true
    this.ready = false
    this.clearFlushTimer()

    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: 'end_of_stream' }))
      this.socket.close()
    } else {
      this.socket?.close()
    }

    this.socket = null
  }

  private handleMessage(message: GradiumServerMessage, resolveReady: () => void): void {
    if (this.closed) return

    if (message.type === 'ready') {
      this.ready = true
      this.callbacks.onReady(message)
      resolveReady()
      return
    }

    if (message.type === 'text') {
      this.callbacks.onText(message.text)
      return
    }

    if (message.type === 'step') {
      const inactivity = message.vad[message.vad.length - 1]?.inactivity_prob
      if (inactivity !== undefined) this.callbacks.onVad(inactivity)
      return
    }

    if (message.type === 'flushed') {
      if (this.flushId !== null && message.flush_id === this.flushId) {
        this.clearFlushTimer()
        this.flushId = null
        const resolve = this.flushResolver
        this.flushResolver = null
        this.flushRejecter = null
        this.callbacks.onFlushed()
        resolve?.()
      }
      return
    }

    if (message.type === 'error') {
      const suffix = message.code === undefined ? '' : ` (${message.code})`
      const error = new Error(`${message.message}${suffix}`)
      this.clearFlushTimer()
      this.flushId = null
      const reject = this.flushRejecter
      this.flushResolver = null
      this.flushRejecter = null
      reject?.(error)
      this.callbacks.onError(error)
    }
  }

  private clearFlushTimer(): void {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
  }
}
