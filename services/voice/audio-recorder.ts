import { AudioStudioModule, type RecordingConfig } from '@siteed/audio-studio'
import { fromByteArray, toByteArray } from 'base64-js'
import { LegacyEventEmitter, type EventSubscription } from 'expo-modules-core'

import { VOICE_CAPTURE } from './config'

type PermissionResult = {
  readonly status?: string
  readonly granted?: boolean
}

type AudioStudioNativeModule = {
  readonly getPermissionsAsync?: () => Promise<PermissionResult>
  readonly requestPermissionsAsync: () => Promise<PermissionResult>
  readonly startRecording: (config: RecordingConfig) => Promise<unknown>
  readonly stopRecording: () => Promise<unknown>
}

type NativeAudioDataEvent = {
  readonly encoded?: string
  readonly pcmFloat32?: Float32Array | readonly number[]
  readonly buffer?: Float32Array
  readonly deltaSize?: number
}

export type AudioFrameHandler = (pcm24kBase64: string) => void

const audioModule = AudioStudioModule as unknown as AudioStudioNativeModule
const audioEmitter = new LegacyEventEmitter(AudioStudioModule)

const recordingConfig: RecordingConfig = {
  sampleRate: VOICE_CAPTURE.INPUT_SAMPLE_RATE,
  channels: VOICE_CAPTURE.CHANNELS,
  encoding: 'pcm_16bit',
  interval: VOICE_CAPTURE.FRAME_INTERVAL_MS,
  bufferDurationSeconds: 0.1,
  streamFormat: 'float32',
  keepAwake: true,
  showNotification: false,
  enableProcessing: false,
  output: {
    primary: { enabled: false },
    compressed: { enabled: false },
  },
  ios: {
    audioSession: {
      category: 'PlayAndRecord',
      mode: 'VoiceChat',
      categoryOptions: ['DefaultToSpeaker', 'AllowBluetooth'],
    },
  },
  android: {
    audioFocusStrategy: 'communication',
  },
}

const clampAudioSample = (sample: number): number => Math.max(-1, Math.min(1, sample))

const writeInt16LittleEndian = (target: Uint8Array, offset: number, sample: number): void => {
  const value = sample < 0 ? sample * 0x8000 : sample * 0x7fff
  const int16 = Math.max(-32768, Math.min(32767, Math.round(value)))
  target[offset] = int16 & 0xff
  target[offset + 1] = (int16 >> 8) & 0xff
}

const float32ToDownsampledPcm16Base64 = (samples: Float32Array): string => {
  const outputSamples = Math.floor(samples.length / 2)
  if (outputSamples <= 0) return ''

  const bytes = new Uint8Array(outputSamples * 2)
  for (let index = 0; index < outputSamples; index += 1) {
    const sourceIndex = index * 2
    const first = samples[sourceIndex] ?? 0
    const second = samples[sourceIndex + 1] ?? first
    writeInt16LittleEndian(bytes, index * 2, clampAudioSample((first + second) / 2))
  }

  return fromByteArray(bytes)
}

const readInt16LittleEndian = (bytes: Uint8Array, offset: number): number => {
  const value = (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8)
  return value >= 0x8000 ? value - 0x10000 : value
}

const pcm16Base64ToDownsampledPcm16Base64 = (base64: string): string => {
  const input = toByteArray(base64)
  const inputSamples = Math.floor(input.length / 2)
  const outputSamples = Math.floor(inputSamples / 2)
  if (outputSamples <= 0) return ''

  const output = new Uint8Array(outputSamples * 2)
  for (let index = 0; index < outputSamples; index += 1) {
    const sourceOffset = index * 4
    const first = readInt16LittleEndian(input, sourceOffset)
    const second = readInt16LittleEndian(input, sourceOffset + 2)
    const averaged = (first + second) / 2 / 0x8000
    writeInt16LittleEndian(output, index * 2, clampAudioSample(averaged))
  }

  return fromByteArray(output)
}

const normaliseFloat32 = (value: Float32Array | readonly number[]): Float32Array =>
  value instanceof Float32Array ? value : new Float32Array(value)

const toGradiumFrame = (event: NativeAudioDataEvent): string => {
  if (event.pcmFloat32 !== undefined) {
    return float32ToDownsampledPcm16Base64(normaliseFloat32(event.pcmFloat32))
  }

  if (event.buffer !== undefined) {
    return float32ToDownsampledPcm16Base64(event.buffer)
  }

  if (event.encoded !== undefined) {
    return pcm16Base64ToDownsampledPcm16Base64(event.encoded)
  }

  return ''
}

export const voiceRecorder = {
  async requestPermission(): Promise<'granted' | 'denied'> {
    const current = await audioModule.getPermissionsAsync?.()
    if (current?.granted === true || current?.status === 'granted') return 'granted'

    const requested = await audioModule.requestPermissionsAsync()
    return requested.granted === true || requested.status === 'granted' ? 'granted' : 'denied'
  },

  subscribe(onFrame: AudioFrameHandler): EventSubscription {
    return audioEmitter.addListener<NativeAudioDataEvent>('AudioData', (event) => {
      if (event.deltaSize === 0) return
      const frame = toGradiumFrame(event)
      if (frame !== '') onFrame(frame)
    })
  },

  async start(): Promise<void> {
    await audioModule.startRecording(recordingConfig)
  },

  async stop(): Promise<void> {
    try {
      await audioModule.stopRecording()
    } catch {
      // The native recorder throws if it has already stopped; callers treat stop as idempotent.
    }
  },
}
