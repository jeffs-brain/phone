import { useShallow } from 'zustand/react/shallow'

import { useStore } from './index'

export const useMessageIds = () => useStore(useShallow((s) => s.messages.map((m) => m.id)))

export const useMessage = (id: string) => useStore((s) => s.messages.find((m) => m.id === id))

export const useStreamingText = (id: string) =>
  useStore((s) => s.messages.find((m) => m.id === id)?.streamingText ?? '')

export const useGenerationStatus = () => useStore((s) => s.generationStatus)

export const useDraftAndAttachments = () =>
  useStore(useShallow((s) => ({ draft: s.draft, attachments: s.stagedAttachments })))

export const useSettings = () =>
  useStore(useShallow((s) => ({
    modelSize: s.modelSize,
    voiceEnabled: s.voiceEnabled,
    rememberConversation: s.rememberConversation,
    providerMode: s.providerMode,
    manualProvider: s.manualProvider,
    devMode: s.devMode,
  })))

export const useLastRouteDecision = () => useStore((s) => s.lastDecision)

export const useHasHydrated = () => useStore.persist.hasHydrated()
