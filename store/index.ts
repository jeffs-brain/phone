import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { createJSONStorage, devtools, persist, subscribeWithSelector } from 'zustand/middleware'

import { createChatSlice } from './slices/chat'
import { createInferenceSlice } from './slices/inference'
import { createMemorySlice } from './slices/memory'
import { createNetworkSlice } from './slices/network'
import { createRoutingSlice } from './slices/routing'
import { createSettingsSlice } from './slices/settings'
import { createVoiceSlice } from './slices/voice'
import type { RootState } from './types'

export const useStore = create<RootState>()(
  devtools(
    subscribeWithSelector(
      persist(
        (...a) => ({
          ...createInferenceSlice(...a),
          ...createChatSlice(...a),
          ...createVoiceSlice(...a),
          ...createMemorySlice(...a),
          ...createNetworkSlice(...a),
          ...createRoutingSlice(...a),
          ...createSettingsSlice(...a),
        }),
        {
          name: 'jeff-phone',
          storage: createJSONStorage(() => AsyncStorage),
          version: 1,
          partialize: (s) => ({
            modelSize: s.modelSize,
            voiceEnabled: s.voiceEnabled,
            voiceTransport: s.voiceTransport,
            thinkingEnabled: s.thinkingEnabled,
            rememberConversation: s.rememberConversation,
            providerMode: s.providerMode,
            manualProvider: s.manualProvider,
            devMode: s.devMode,
          }),
          onRehydrateStorage: () => () => undefined,
        },
      ),
    ),
    { name: 'JeffStore', enabled: __DEV__ },
  ),
)

export const storeApi = {
  get: useStore.getState,
  set: useStore.setState,
  subscribe: useStore.subscribe,
}
