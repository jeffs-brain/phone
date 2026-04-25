import { createId } from '../../lib/id'
import { storeApi } from '../../store'

import { DEFAULT_GRADIUM_TTS_VOICE_ID, GRADIUM_API_KEY, TTS_PLAYBACK } from './config'
import { GradiumTtsClient } from './gradium-tts'
import { PcmQueuePlayer } from './pcm-player'

type SpeakOptions = {
  readonly messageId: string
  readonly text: string
  readonly signal?: AbortSignal
}

type ActiveSpeech = {
  readonly id: string
  readonly client: GradiumTtsClient
  readonly player: PcmQueuePlayer
}

let activeSpeech: ActiveSpeech | null = null

const speechText = (text: string): string =>
  text
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, TTS_PLAYBACK.MAX_CHARS)

export const ttsSession = {
  async speak(options: SpeakOptions): Promise<void> {
    const text = speechText(options.text)
    if (text === '') return

    if (GRADIUM_API_KEY === undefined || GRADIUM_API_KEY.trim() === '') {
      storeApi.get().setVoiceStatus('error')
      storeApi.get().setVoiceError('Gradium API key is missing.')
      throw new Error('Gradium API key is missing.')
    }

    this.stop()

    const id = createId('tts')
    const player = new PcmQueuePlayer()
    const client = new GradiumTtsClient(
      GRADIUM_API_KEY,
      {
        onReady: (message) => {
          storeApi.get().setTtsRequestId(message.request_id)
        },
        onAudio: (audio) => {
          player.enqueuePcm16Base64(audio)
        },
      },
      DEFAULT_GRADIUM_TTS_VOICE_ID,
    )

    activeSpeech = { id, client, player }
    storeApi.get().enqueueTts({ id, messageId: options.messageId, text })
    storeApi.get().advanceTts()
    storeApi.get().setVoiceStatus('speaking')
    storeApi.get().setVoiceError(null)

    let failed = false
    try {
      await player.start()
      await client.speak(text, options.signal)
      await player.finish()
    } catch (error) {
      failed = true
      storeApi.get().setVoiceStatus('error')
      storeApi.get().setVoiceError(error instanceof Error ? error.message : 'Voice playback failed.')
      throw error
    } finally {
      if (activeSpeech?.id === id) activeSpeech = null
      storeApi.get().advanceTts()
      storeApi.get().setTtsRequestId(null)
      client.close()
      await player.stop()
      if (!failed && storeApi.get().voiceStatus === 'speaking') {
        storeApi.get().setVoiceStatus('idle')
      }
    }
  },

  stop(): void {
    const speech = activeSpeech
    if (speech === null) return

    activeSpeech = null
    speech.client.close()
    void speech.player.stop()
    storeApi.get().advanceTts()
    storeApi.get().setTtsRequestId(null)
    if (storeApi.get().voiceStatus === 'speaking') {
      storeApi.get().setVoiceStatus('idle')
    }
  },
}
