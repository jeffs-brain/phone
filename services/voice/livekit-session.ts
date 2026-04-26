import type { AudioSession } from '@livekit/react-native'
import type { RemoteParticipant, Room } from 'livekit-client'

import { isGenerationActive } from '../../lib/runtime-status'
import { storeApi } from '../../store'
import type { Message } from '../../store/types'

import { LIVEKIT_TOKEN_ENDPOINT, LIVEKIT_VOICE, liveKitTokenEndpointError } from './config'
import { voiceRecorder } from './audio-recorder'
import {
  decodeLiveKitVoiceEvent,
  encodeLiveKitVoiceEvent,
  LIVEKIT_VOICE_TOPIC,
  type LiveKitVoiceOutboundEvent,
} from './livekit-protocol'

type LiveKitTokenResponse = {
  readonly serverUrl: string
  readonly token: string
  readonly roomName: string
  readonly identity: string
}

type ActiveLiveKitTurn = {
  readonly room: Room
  readonly audioSession: typeof AudioSession
  readonly roomEvent: typeof import('livekit-client')['RoomEvent']
  readonly startedAt: number
  readonly onDataReceived: (
    payload: Uint8Array,
    participant?: RemoteParticipant,
    kind?: unknown,
    topic?: string,
    encryptionType?: unknown,
  ) => void
  readonly onDisconnected: () => void
  speechDone: Promise<void>
  resolveSpeechDone: () => void
  finishing: boolean
  closing: boolean
}

type JsonRecord = Record<string, unknown>
type LiveKitModules = {
  readonly AudioSession: typeof AudioSession
  readonly Room: typeof import('livekit-client')['Room']
  readonly RoomEvent: typeof import('livekit-client')['RoomEvent']
}

let activeTurn: ActiveLiveKitTurn | null = null
let liveKitTurnSequence = 0
let liveKitModulesPromise: Promise<LiveKitModules> | null = null

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const stringValue = (record: JsonRecord, key: string): string | null =>
  typeof record[key] === 'string' ? record[key] : null

const normaliseTranscript = (text: string): string => text.replace(/\s+/g, ' ').trim()

const errorDetail = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback

const loadLiveKitModules = async (): Promise<LiveKitModules> => {
  liveKitModulesPromise ??= Promise.all([
    import('@livekit/react-native'),
    import('livekit-client'),
  ])
    .then(([nativeModule, clientModule]) => {
      nativeModule.registerGlobals()
      return {
        AudioSession: nativeModule.AudioSession,
        Room: clientModule.Room,
        RoomEvent: clientModule.RoomEvent,
      }
    })
    .catch((error: unknown) => {
      liveKitModulesPromise = null
      throw new Error(
        `LiveKit native voice is not available in this dev client. Rebuild and reinstall the app after pod install. ${errorDetail(error, '')}`.trim(),
      )
    })

  return liveKitModulesPromise
}

const stopAudioSessionIfLoaded = async (): Promise<void> => {
  if (liveKitModulesPromise === null) return
  const modules = await liveKitModulesPromise.catch(() => null)
  await modules?.AudioSession.stopAudioSession().catch(() => undefined)
}

const fetchWithTimeout = async (url: string, timeoutMs: number): Promise<Response> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { method: 'GET', signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

const parseTokenResponse = (value: unknown): LiveKitTokenResponse => {
  if (!isRecord(value)) throw new Error('LiveKit token response was not an object.')

  const serverUrl = stringValue(value, 'serverUrl')
  const token = stringValue(value, 'token')
  const roomName = stringValue(value, 'roomName')
  const identity = stringValue(value, 'identity')

  if (serverUrl === null || token === null || roomName === null || identity === null) {
    throw new Error('LiveKit token response is missing required fields.')
  }

  return { serverUrl, token, roomName, identity }
}

const requestToken = async (): Promise<LiveKitTokenResponse> => {
  const configError = liveKitTokenEndpointError()
  if (configError !== null) throw new Error(configError)
  if (LIVEKIT_TOKEN_ENDPOINT === undefined) throw new Error('LiveKit token endpoint is not configured.')

  const response = await fetchWithTimeout(LIVEKIT_TOKEN_ENDPOINT, LIVEKIT_VOICE.CONNECT_TIMEOUT_MS)
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message = isRecord(body) ? stringValue(body, 'error') : null
    throw new Error(message ?? `LiveKit token request failed with HTTP ${response.status}.`)
  }

  return parseTokenResponse(body)
}

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> => {
  let timeout: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs)
      }),
    ])
  } finally {
    if (timeout !== null) clearTimeout(timeout)
  }
}

const assistantText = (message: Message): string =>
  message.parts
    .filter((part): part is Extract<Message['parts'][number], { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
    .trim()

const latestAssistantText = (): string => {
  const messages = storeApi.get().messages
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role !== 'assistant') continue
    const text = assistantText(message)
    if (text !== '') return text
    const streamingText = message.streamingText?.trim()
    if (streamingText !== undefined && streamingText !== '') return streamingText
  }
  return ''
}

const publish = async (turn: ActiveLiveKitTurn, event: LiveKitVoiceOutboundEvent): Promise<void> => {
  await turn.room.localParticipant.publishData(
    encodeLiveKitVoiceEvent(event),
    { reliable: true, topic: LIVEKIT_VOICE_TOPIC },
  )
}

const waitForSpeechDone = async (turn: ActiveLiveKitTurn): Promise<void> => {
  await withTimeout(
    turn.speechDone,
    LIVEKIT_VOICE.SPEECH_DONE_TIMEOUT_MS,
    'Timed out waiting for LiveKit speech playback to finish.',
  )
}

const cleanupTurn = async (turn: ActiveLiveKitTurn, nextStatus: 'idle' | 'error' = 'idle'): Promise<void> => {
  if (turn.closing) return
  turn.closing = true
  turn.resolveSpeechDone()
  turn.room.off(turn.roomEvent.DataReceived, turn.onDataReceived)
  turn.room.off(turn.roomEvent.Disconnected, turn.onDisconnected)

  try {
    await turn.room.localParticipant.setMicrophoneEnabled(false).catch(() => undefined)
    await turn.room.disconnect(true).catch(() => undefined)
  } finally {
    await turn.audioSession.stopAudioSession().catch(() => undefined)
    if (activeTurn === turn) activeTurn = null
    storeApi.get().setRecording(false)
    storeApi.get().setVadInactivity(null)
    storeApi.get().setSttRequestId(null)
    storeApi.get().setTtsRequestId(null)
    if (nextStatus === 'idle') {
      storeApi.get().setVoiceStatus('idle')
      storeApi.get().setVoiceError(null)
    }
  }
}

const failTurn = async (turn: ActiveLiveKitTurn | null, detail: string): Promise<void> => {
  if (turn?.closing === true) return
  if (turn !== null) await cleanupTurn(turn, 'error')
  else await stopAudioSessionIfLoaded()

  storeApi.get().setRecording(false)
  storeApi.get().setVoiceStatus('error')
  storeApi.get().setVoiceError(detail)
}

const handleFinalTranscript = async (turn: ActiveLiveKitTurn, text: string): Promise<void> => {
  if (turn.finishing || turn.closing) return
  turn.finishing = true

  const transcript = normaliseTranscript(text)
  storeApi.get().setRecording(false)
  storeApi.get().setAsrPartial('')

  if (transcript === '') {
    storeApi.get().commitAsrFinal('')
    await cleanupTurn(turn)
    return
  }

  try {
    storeApi.get().commitAsrFinal(transcript)
    storeApi.get().setVoiceStatus('sending')
    storeApi.get().setVoiceError(null)
    await turn.room.localParticipant.setMicrophoneEnabled(false)
    await storeApi.get().sendUserMessage({ text: transcript })

    const responseText = latestAssistantText()
    if (responseText === '') {
      await cleanupTurn(turn)
      return
    }

    storeApi.get().setVoiceStatus('speaking')
    await publish(turn, { type: 'assistant_response', text: responseText })
    await waitForSpeechDone(turn)
    await cleanupTurn(turn)
  } catch (error) {
    await failTurn(turn, errorDetail(error, 'LiveKit voice turn failed.'))
  }
}

const createTurn = (
  room: Room,
  audioSession: typeof AudioSession,
  roomEvent: typeof import('livekit-client')['RoomEvent'],
): ActiveLiveKitTurn => {
  let resolveSpeechDone: () => void = () => undefined
  const speechDone = new Promise<void>((resolve) => {
    resolveSpeechDone = resolve
  })

  const turn: ActiveLiveKitTurn = {
    room,
    audioSession,
    roomEvent,
    startedAt: Date.now(),
    onDataReceived: (payload, _participant, _kind, topic) => {
      if (topic !== LIVEKIT_VOICE_TOPIC) return
      const event = decodeLiveKitVoiceEvent(payload)
      if (event === null) return

      if (event.type === 'transcript_partial') {
        if (!turn.finishing && !turn.closing) {
          storeApi.get().setAsrPartial(normaliseTranscript(event.text))
        }
        return
      }

      if (event.type === 'transcript_final') {
        void handleFinalTranscript(turn, event.text)
        return
      }

      if (event.type === 'speech_started') {
        if (!turn.closing) storeApi.get().setVoiceStatus('speaking')
        return
      }

      if (event.type === 'speech_done') {
        turn.resolveSpeechDone()
        return
      }

      void failTurn(turn, event.message)
    },
    onDisconnected: () => {
      if (turn.closing) return
      void failTurn(turn, 'LiveKit voice room disconnected.')
    },
    speechDone,
    resolveSpeechDone,
    finishing: false,
    closing: false,
  }

  return turn
}

const turnWasSuperseded = (turn: ActiveLiveKitTurn, sequence: number): boolean =>
  sequence !== liveKitTurnSequence || activeTurn !== turn || turn.closing

export const livekitVoiceSession = {
  async requestMicPermission(): Promise<void> {
    storeApi.get().setVoiceStatus('requesting-permission')
    const permission = await voiceRecorder.requestPermission()
    storeApi.get().setMicPermission(permission)
    storeApi.get().setVoiceStatus(permission === 'granted' ? 'idle' : 'error')
    storeApi.get().setVoiceError(permission === 'granted' ? null : 'Microphone permission was denied.')
  },

  async startTurn(): Promise<void> {
    if (activeTurn !== null) return
    const sequence = liveKitTurnSequence + 1
    liveKitTurnSequence = sequence

    if (!storeApi.get().voiceEnabled) {
      storeApi.get().setVoiceError('Voice is disabled in settings.')
      return
    }

    if (storeApi.get().networkStatus === 'offline') {
      storeApi.get().setVoiceStatus('error')
      storeApi.get().setVoiceError('ai-coustics voice needs a network connection. Local text chat still works offline.')
      return
    }

    const configError = liveKitTokenEndpointError()
    if (configError !== null) {
      storeApi.get().setVoiceStatus('error')
      storeApi.get().setVoiceError(configError)
      return
    }

    if (isGenerationActive(storeApi.get().generationStatus)) {
      storeApi.get().setVoiceError('Wait for Jeff to finish before starting voice.')
      return
    }

    storeApi.get().setVoiceStatus('requesting-permission')
    storeApi.get().setVoiceError(null)
    storeApi.get().setAsrPartial('')
    storeApi.get().commitAsrFinal('')
    storeApi.get().setVadInactivity(null)

    const permission = await voiceRecorder.requestPermission()
    if (sequence !== liveKitTurnSequence) return
    storeApi.get().setMicPermission(permission)
    if (permission !== 'granted') {
      storeApi.get().setVoiceStatus('error')
      storeApi.get().setVoiceError('Microphone permission was denied.')
      return
    }

    storeApi.get().setVoiceStatus('connecting')
    let modules: LiveKitModules
    try {
      modules = await loadLiveKitModules()
    } catch (error) {
      storeApi.get().setVoiceStatus('error')
      storeApi.get().setVoiceError(errorDetail(error, 'LiveKit native voice is not available in this dev client.'))
      return
    }

    const room = new modules.Room()
    const turn = createTurn(room, modules.AudioSession, modules.RoomEvent)
    activeTurn = turn
    room.on(modules.RoomEvent.DataReceived, turn.onDataReceived)
    room.on(modules.RoomEvent.Disconnected, turn.onDisconnected)

    try {
      const token = await requestToken()
      if (turnWasSuperseded(turn, sequence)) {
        await cleanupTurn(turn)
        return
      }

      await modules.AudioSession.startAudioSession()
      if (turnWasSuperseded(turn, sequence)) {
        await cleanupTurn(turn)
        return
      }

      await withTimeout(
        room.connect(token.serverUrl, token.token, { autoSubscribe: true }),
        LIVEKIT_VOICE.CONNECT_TIMEOUT_MS,
        'Timed out connecting to LiveKit.',
      )
      if (turnWasSuperseded(turn, sequence)) {
        await cleanupTurn(turn)
        return
      }

      await room.localParticipant.setMicrophoneEnabled(true)
      if (turnWasSuperseded(turn, sequence)) {
        await cleanupTurn(turn)
        return
      }

      storeApi.get().setRecording(true)
      storeApi.get().setVoiceStatus('listening')
    } catch (error) {
      if (turnWasSuperseded(turn, sequence)) {
        await cleanupTurn(turn)
        return
      }
      await failTurn(turn, errorDetail(error, 'LiveKit voice setup failed.'))
    }
  },

  async stopTurn(): Promise<void> {
    const turn = activeTurn
    if (turn === null || turn.closing) return
    storeApi.get().setVoiceStatus('ending-turn')
    storeApi.get().setRecording(false)
    setTimeout(() => {
      if (activeTurn === turn && !turn.finishing && !turn.closing) {
        void failTurn(turn, 'No transcript was received from LiveKit.')
      }
    }, LIVEKIT_VOICE.FINAL_TRANSCRIPT_TIMEOUT_MS)
    try {
      await publish(turn, { type: 'stop_listening' })
      await turn.room.localParticipant.setMicrophoneEnabled(false)
    } catch (error) {
      await failTurn(turn, errorDetail(error, 'Could not stop the LiveKit voice turn.'))
    }
  },

  async cancelTurn(): Promise<void> {
    liveKitTurnSequence += 1
    const turn = activeTurn
    if (turn === null) {
      await stopAudioSessionIfLoaded()
      storeApi.get().setVoiceStatus('idle')
      storeApi.get().setVoiceError(null)
      return
    }

    await publish(turn, { type: 'stop_listening' }).catch(() => undefined)
    await cleanupTurn(turn)
    storeApi.get().setAsrPartial('')
    storeApi.get().commitAsrFinal('')
  },
}
