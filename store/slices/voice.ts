import type { Slice } from '../types'

export type TtsItem = { id: string; text: string; messageId: string }
export type MicPermission = 'unknown' | 'granted' | 'denied'

export type VoiceSlice = {
  micPermission: MicPermission
  recording: boolean
  asrPartial: string
  asrFinal: string
  ttsQueue: TtsItem[]
  ttsCurrent: TtsItem | null
  requestMicPermission: () => Promise<void>
  startRecording: () => Promise<void>
  stopRecording: () => Promise<void>
  setAsrPartial: (text: string) => void
  commitAsrFinal: (text: string) => void
  enqueueTts: (item: TtsItem) => void
  advanceTts: () => void
}

export const createVoiceSlice: Slice<VoiceSlice> = (set) => ({
  micPermission: 'unknown',
  recording: false,
  asrPartial: '',
  asrFinal: '',
  ttsQueue: [],
  ttsCurrent: null,

  requestMicPermission: async () => {
    // Delegates to services/voice.requestPermission
  },
  startRecording: async () => {
    // Delegates to services/voice.startCapture
  },
  stopRecording: async () => {
    // Delegates to services/voice.stopCapture
  },

  setAsrPartial: (asrPartial) => set({ asrPartial }, false, 'voice/setAsrPartial'),
  commitAsrFinal: (asrFinal) => set({ asrFinal, asrPartial: '' }, false, 'voice/commitAsrFinal'),

  enqueueTts: (item) =>
    set((s) => ({ ttsQueue: [...s.ttsQueue, item] }), false, 'voice/enqueueTts'),

  advanceTts: () =>
    set((s) => {
      const [next, ...rest] = s.ttsQueue
      return { ttsCurrent: next ?? null, ttsQueue: rest }
    }, false, 'voice/advanceTts'),
})
