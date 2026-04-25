import { AudioContext, type AudioBufferQueueSourceNode } from 'react-native-audio-api'

import { TTS_PLAYBACK } from './config'

export class PcmQueuePlayer {
  private context: AudioContext | null = null
  private source: AudioBufferQueueSourceNode | null = null
  private bufferIds = new Set<string>()
  private decodeChain = Promise.resolve()
  private totalDurationMs = TTS_PLAYBACK.FINISH_PADDING_MS
  private started = false
  private finishing = false
  private stopped = false
  private finishTimer: ReturnType<typeof setTimeout> | null = null
  private finishResolver: (() => void) | null = null

  async start(): Promise<void> {
    if (this.context !== null) return

    const context = new AudioContext({ sampleRate: TTS_PLAYBACK.SAMPLE_RATE })
    const source = context.createBufferQueueSource({ pitchCorrection: false })
    source.connect(context.destination)
    source.onBufferEnded = (event) => {
      this.bufferIds.delete(event.bufferId)
      if (this.finishing && (event.isLastBufferInQueue || this.bufferIds.size === 0)) {
        this.resolveFinish()
      }
    }
    await context.resume()

    this.context = context
    this.source = source
    this.stopped = false
  }

  enqueuePcm16Base64(base64: string): void {
    if (this.context === null || this.source === null) return

    this.decodeChain = this.decodeChain
      .then(async () => {
        if (this.stopped || this.context === null || this.source === null) return
        const buffer = await this.context.decodePCMInBase64(
          base64,
          TTS_PLAYBACK.SAMPLE_RATE,
          TTS_PLAYBACK.CHANNELS,
          true,
        )
        if (this.stopped || this.source === null) return

        const bufferId = this.source.enqueueBuffer(buffer)
        this.bufferIds.add(bufferId)
        this.totalDurationMs += buffer.duration * 1000
        if (!this.started) {
          this.source.start(0, 0)
          this.started = true
        }
      })
      .catch(() => undefined)
  }

  async finish(): Promise<void> {
    await this.decodeChain
    if (this.source === null || this.bufferIds.size === 0) {
      await this.stop()
      return
    }

    this.finishing = true
    await new Promise<void>((resolve) => {
      this.finishResolver = resolve
      this.finishTimer = setTimeout(
        () => this.resolveFinish(),
        Math.max(1000, Math.ceil(this.totalDurationMs + TTS_PLAYBACK.FINISH_PADDING_MS)),
      )
    })
    await this.stop()
  }

  async stop(): Promise<void> {
    this.clearFinishTimer()
    this.finishResolver = null
    this.finishing = false

    const source = this.source
    const context = this.context
    this.stopped = true
    this.source = null
    this.context = null
    this.bufferIds.clear()
    this.decodeChain = Promise.resolve()
    this.totalDurationMs = TTS_PLAYBACK.FINISH_PADDING_MS
    this.started = false

    try {
      source?.clearBuffers()
      source?.stop()
    } catch {
      // Audio shutdown is idempotent from the voice session's point of view.
    }

    await context?.close().catch(() => undefined)
  }

  private resolveFinish(): void {
    const resolve = this.finishResolver
    if (resolve === null) return
    this.clearFinishTimer()
    this.finishResolver = null
    resolve()
  }

  private clearFinishTimer(): void {
    if (this.finishTimer !== null) {
      clearTimeout(this.finishTimer)
      this.finishTimer = null
    }
  }
}
