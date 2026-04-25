import type { Slice } from '../types'

export type TtsItem = { id: string; text: string; messageId: string }
export type MicPermission = 'unknown' | 'granted' | 'denied'
export type VoiceStatus =
  | 'idle'
  | 'requesting-permission'
  | 'connecting'
  | 'listening'
  | 'ending-turn'
  | 'transcribing'
  | 'sending'
  | 'speaking'
  | 'error'

export type VoiceSlice = {
  voiceStatus: VoiceStatus
  micPermission: MicPermission
  recording: boolean
  asrPartial: string
  asrFinal: string
  voiceError: string | null
  vadInactivity: number | null
  sttRequestId: string | null
  ttsRequestId: string | null
  ttsQueue: TtsItem[]
  ttsCurrent: TtsItem | null
  requestMicPermission: () => Promise<void>
  startRecording: () => Promise<void>
  stopRecording: () => Promise<void>
  cancelVoice: () => Promise<void>
  setVoiceStatus: (status: VoiceStatus) => void
  setMicPermission: (permission: MicPermission) => void
  setRecording: (recording: boolean) => void
  setAsrPartial: (text: string) => void
  commitAsrFinal: (text: string) => void
  setVoiceError: (error: string | null) => void
  setVadInactivity: (vadInactivity: number | null) => void
  setSttRequestId: (sttRequestId: string | null) => void
  setTtsRequestId: (ttsRequestId: string | null) => void
  enqueueTts: (item: TtsItem) => void
  advanceTts: () => void
}

export const createVoiceSlice: Slice<VoiceSlice> = (set) => ({
  voiceStatus: 'idle',
  micPermission: 'unknown',
  recording: false,
  asrPartial: '',
  asrFinal: '',
  voiceError: null,
  vadInactivity: null,
  sttRequestId: null,
  ttsRequestId: null,
  ttsQueue: [],
  ttsCurrent: null,

  requestMicPermission: async () => {
    const { voiceSession } = await import('../../services/voice/session')
    await voiceSession.requestMicPermission()
  },
  startRecording: async () => {
    const { voiceSession } = await import('../../services/voice/session')
    await voiceSession.startTurn()
  },
  stopRecording: async () => {
    const { voiceSession } = await import('../../services/voice/session')
    await voiceSession.stopTurn()
  },
  cancelVoice: async () => {
    const { voiceSession } = await import('../../services/voice/session')
    await voiceSession.cancelTurn()
  },

  setVoiceStatus: (voiceStatus) => set({ voiceStatus }, false, 'voice/setVoiceStatus'),
  setMicPermission: (micPermission) => set({ micPermission }, false, 'voice/setMicPermission'),
  setRecording: (recording) => set({ recording }, false, 'voice/setRecording'),
  setAsrPartial: (asrPartial) => set({ asrPartial }, false, 'voice/setAsrPartial'),
  commitAsrFinal: (asrFinal) => set({ asrFinal, asrPartial: '' }, false, 'voice/commitAsrFinal'),
  setVoiceError: (voiceError) => set({ voiceError }, false, 'voice/setVoiceError'),
  setVadInactivity: (vadInactivity) => set({ vadInactivity }, false, 'voice/setVadInactivity'),
  setSttRequestId: (sttRequestId) => set({ sttRequestId }, false, 'voice/setSttRequestId'),
  setTtsRequestId: (ttsRequestId) => set({ ttsRequestId }, false, 'voice/setTtsRequestId'),

  enqueueTts: (item) =>
    set((s) => ({ ttsQueue: [...s.ttsQueue, item] }), false, 'voice/enqueueTts'),

  advanceTts: () =>
    set((s) => {
      const [next, ...rest] = s.ttsQueue
      return { ttsCurrent: next ?? null, ttsQueue: rest }
    }, false, 'voice/advanceTts'),
})
