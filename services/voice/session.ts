import type { EventSubscription } from 'expo-modules-core'

import { storeApi } from '../../store'

import { GRADIUM_API_KEY, VOICE_CAPTURE } from './config'
import { GradiumSttClient } from './gradium-stt'
import { voiceRecorder } from './audio-recorder'

type ActiveVoiceTurn = {
  readonly stt: GradiumSttClient
  readonly subscription: EventSubscription
  readonly startedAt: number
  transcriptParts: string[]
  finishing: boolean
}

let activeTurn: ActiveVoiceTurn | null = null

const normaliseTranscript = (text: string): string => text.replace(/\s+/g, ' ').trim()

const turnTranscript = (turn: ActiveVoiceTurn): string => normaliseTranscript(turn.transcriptParts.join(' '))

const errorDetail = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback

const appendTranscript = (turn: ActiveVoiceTurn, text: string): string => {
  const segment = normaliseTranscript(text)
  if (segment === '') return turnTranscript(turn)

  const last = turn.transcriptParts[turn.transcriptParts.length - 1]
  if (last !== segment) turn.transcriptParts = [...turn.transcriptParts, segment]

  return turnTranscript(turn)
}

const cleanupTurn = async (turn: ActiveVoiceTurn): Promise<void> => {
  turn.subscription.remove()
  turn.stt.close()
  await voiceRecorder.stop()
  if (activeTurn === turn) activeTurn = null
}

const failTurn = async (detail: string): Promise<void> => {
  const turn = activeTurn
  if (turn !== null) await cleanupTurn(turn)
  else await voiceRecorder.stop()

  storeApi.get().setRecording(false)
  storeApi.get().setVoiceStatus('error')
  storeApi.get().setVoiceError(detail)
}

const finishTurn = async (reason: 'vad' | 'manual'): Promise<void> => {
  const turn = activeTurn
  if (turn === null || turn.finishing) return

  turn.finishing = true
  storeApi.get().setVoiceStatus(reason === 'vad' ? 'transcribing' : 'ending-turn')
  storeApi.get().setRecording(false)

  try {
    await voiceRecorder.stop()
    let flushError: Error | null = null
    try {
      await turn.stt.flush()
    } catch (error) {
      flushError = error instanceof Error ? error : new Error('Voice flush failed.')
    }

    const finalTranscript = turnTranscript(turn)

    await cleanupTurn(turn)

    if (finalTranscript === '') {
      storeApi.get().commitAsrFinal('')
      storeApi.get().setVoiceStatus('idle')
      storeApi.get().setVoiceError(flushError?.message ?? 'No speech was detected.')
      return
    }

    storeApi.get().commitAsrFinal(finalTranscript)
    storeApi.get().setVoiceError(null)
    storeApi.get().setVoiceStatus('sending')
    await storeApi.get().sendUserMessage({ text: finalTranscript })
    storeApi.get().setVoiceStatus('idle')
  } catch (error) {
    await cleanupTurn(turn)
    storeApi.get().setVoiceStatus('error')
    storeApi.get().setVoiceError(errorDetail(error, 'Voice turn failed.'))
  }
}

const maybeAutoFinishTurn = (turn: ActiveVoiceTurn, inactivity: number): void => {
  const hasTranscript = turnTranscript(turn) !== ''
  const oldEnough = Date.now() - turn.startedAt >= VOICE_CAPTURE.MIN_AUTO_END_MS
  if (!hasTranscript || !oldEnough || turn.finishing) return

  if (inactivity >= VOICE_CAPTURE.VAD_INACTIVITY_THRESHOLD) {
    void finishTurn('vad')
  }
}

export const voiceSession = {
  async requestMicPermission(): Promise<void> {
    storeApi.get().setVoiceStatus('requesting-permission')
    const permission = await voiceRecorder.requestPermission()
    storeApi.get().setMicPermission(permission)
    storeApi.get().setVoiceStatus(permission === 'granted' ? 'idle' : 'error')
    storeApi.get().setVoiceError(permission === 'granted' ? null : 'Microphone permission was denied.')
  },

  async startTurn(): Promise<void> {
    if (activeTurn !== null) return

    if (!storeApi.get().voiceEnabled) {
      storeApi.get().setVoiceError('Voice is disabled in settings.')
      return
    }

    if (GRADIUM_API_KEY === undefined || GRADIUM_API_KEY.trim() === '') {
      storeApi.get().setVoiceStatus('error')
      storeApi.get().setVoiceError('Gradium API key is missing.')
      return
    }

    const generationStatus = storeApi.get().generationStatus
    if (
      generationStatus === 'routing'
      || generationStatus === 'preparing-vision'
      || generationStatus === 'loading-first-token'
      || generationStatus === 'thinking'
      || generationStatus === 'using-tools'
      || generationStatus === 'streaming'
    ) {
      storeApi.get().setVoiceError('Wait for Jeff to finish before starting voice.')
      return
    }

    storeApi.get().setVoiceStatus('requesting-permission')
    storeApi.get().setVoiceError(null)
    storeApi.get().setAsrPartial('')
    storeApi.get().commitAsrFinal('')
    storeApi.get().setVadInactivity(null)

    const permission = await voiceRecorder.requestPermission()
    storeApi.get().setMicPermission(permission)
    if (permission !== 'granted') {
      storeApi.get().setVoiceStatus('error')
      storeApi.get().setVoiceError('Microphone permission was denied.')
      return
    }

    storeApi.get().setVoiceStatus('connecting')

    const stt = new GradiumSttClient(GRADIUM_API_KEY, {
      onReady: (message) => {
        storeApi.get().setSttRequestId(message.request_id)
      },
      onText: (text) => {
        const turn = activeTurn
        if (turn === null) return
        storeApi.get().setAsrPartial(appendTranscript(turn, text))
      },
      onVad: (inactivity) => {
        const turn = activeTurn
        if (turn === null) return
        storeApi.get().setVadInactivity(inactivity)
        maybeAutoFinishTurn(turn, inactivity)
      },
      onFlushed: () => {
        storeApi.get().setVoiceStatus('transcribing')
      },
      onError: (error) => {
        const turn = activeTurn
        if (turn?.finishing === true) return
        void failTurn(error.message)
      },
    })

    let subscription: EventSubscription | null = null

    try {
      await stt.connect()
      subscription = voiceRecorder.subscribe((frame) => stt.sendAudioBase64(frame))
      const turn: ActiveVoiceTurn = {
        stt,
        subscription,
        startedAt: Date.now(),
        transcriptParts: [],
        finishing: false,
      }
      activeTurn = turn
      await voiceRecorder.start()
      storeApi.get().setRecording(true)
      storeApi.get().setVoiceStatus('listening')
    } catch (error) {
      if (activeTurn?.stt === stt) {
        await cleanupTurn(activeTurn)
      } else {
        subscription?.remove()
        stt.close()
        await voiceRecorder.stop()
      }

      await failTurn(error instanceof Error ? error.message : 'Voice setup failed.')
    }
  },

  async stopTurn(): Promise<void> {
    await finishTurn('manual')
  },

  async cancelTurn(): Promise<void> {
    const turn = activeTurn
    if (turn !== null) {
      await cleanupTurn(turn)
    } else {
      await voiceRecorder.stop()
    }

    const { ttsSession } = await import('./tts-session')
    ttsSession.stop()

    storeApi.get().setRecording(false)
    storeApi.get().setAsrPartial('')
    storeApi.get().commitAsrFinal('')
    storeApi.get().setVadInactivity(null)
    storeApi.get().setVoiceStatus('idle')
    storeApi.get().setVoiceError(null)
  },
}
