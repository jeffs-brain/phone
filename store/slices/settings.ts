import type { ModelId } from './inference'
import type { ProviderId, Slice } from '../types'

export type ProviderMode = 'manual' | 'smart'

export type SettingsSlice = {
  modelSize: ModelId
  voiceEnabled: boolean
  thinkingEnabled: boolean
  rememberConversation: boolean
  providerMode: ProviderMode
  manualProvider: ProviderId
  devMode: boolean
  setModelSize: (size: ModelId) => void
  setVoiceEnabled: (enabled: boolean) => void
  setThinkingEnabled: (enabled: boolean) => void
  setRememberConversation: (enabled: boolean) => void
  setProviderMode: (mode: ProviderMode) => void
  setManualProvider: (provider: ProviderId) => void
  setDevMode: (enabled: boolean) => void
}

export const createSettingsSlice: Slice<SettingsSlice> = (set) => ({
  modelSize: 'gemma-4-E2B',
  voiceEnabled: true,
  thinkingEnabled: false,
  rememberConversation: true,
  providerMode: 'manual',
  manualProvider: 'gemma-local',
  devMode: __DEV__,

  setModelSize: (modelSize) => set({ modelSize }, false, 'settings/setModelSize'),
  setVoiceEnabled: (voiceEnabled) => set({ voiceEnabled }, false, 'settings/setVoiceEnabled'),
  setThinkingEnabled: (thinkingEnabled) => set({ thinkingEnabled }, false, 'settings/setThinkingEnabled'),
  setRememberConversation: (rememberConversation) =>
    set({ rememberConversation }, false, 'settings/setRememberConversation'),
  setProviderMode: (providerMode) => set({ providerMode }, false, 'settings/setProviderMode'),
  setManualProvider: (manualProvider) => set({ manualProvider }, false, 'settings/setManualProvider'),
  setDevMode: (devMode) => set({ devMode }, false, 'settings/setDevMode'),
})
