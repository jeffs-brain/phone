import type { ModelId } from './inference'
import type { ProviderId, Slice } from '../types'

export type ProviderMode = 'manual' | 'smart'
export type VoiceTransport = 'gradium-direct' | 'livekit-ai-coustics'

const configuredVoiceTransport = (): VoiceTransport =>
  process.env.EXPO_PUBLIC_VOICE_TRANSPORT === 'livekit-ai-coustics'
    ? 'livekit-ai-coustics'
    : 'gradium-direct'

export type SettingsSlice = {
  modelSize: ModelId
  voiceEnabled: boolean
  voiceTransport: VoiceTransport
  thinkingEnabled: boolean
  rememberConversation: boolean
  providerMode: ProviderMode
  manualProvider: ProviderId
  devMode: boolean
  setModelSize: (size: ModelId) => void
  setVoiceEnabled: (enabled: boolean) => void
  setVoiceTransport: (transport: VoiceTransport) => void
  setThinkingEnabled: (enabled: boolean) => void
  setRememberConversation: (enabled: boolean) => void
  setProviderMode: (mode: ProviderMode) => void
  setManualProvider: (provider: ProviderId) => void
  setDevMode: (enabled: boolean) => void
}

export const createSettingsSlice: Slice<SettingsSlice> = (set, get) => ({
  modelSize: 'gemma-4-E2B',
  voiceEnabled: true,
  voiceTransport: configuredVoiceTransport(),
  thinkingEnabled: false,
  rememberConversation: true,
  providerMode: 'manual',
  manualProvider: 'gemma-local',
  devMode: __DEV__,

  setModelSize: (modelSize) => set({ modelSize }, false, 'settings/setModelSize'),
  setVoiceEnabled: (voiceEnabled) => set({ voiceEnabled }, false, 'settings/setVoiceEnabled'),
  setVoiceTransport: (voiceTransport) => {
    const voiceStatus = get().voiceStatus
    if (voiceStatus !== 'idle' && voiceStatus !== 'error') return
    set({ voiceTransport }, false, 'settings/setVoiceTransport')
  },
  setThinkingEnabled: (thinkingEnabled) => set({ thinkingEnabled }, false, 'settings/setThinkingEnabled'),
  setRememberConversation: (rememberConversation) =>
    set({ rememberConversation }, false, 'settings/setRememberConversation'),
  setProviderMode: (providerMode) => set({ providerMode }, false, 'settings/setProviderMode'),
  setManualProvider: (manualProvider) => set({ manualProvider }, false, 'settings/setManualProvider'),
  setDevMode: (devMode) => set({ devMode }, false, 'settings/setDevMode'),
})
