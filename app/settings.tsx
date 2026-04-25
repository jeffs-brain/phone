import { useCallback, useEffect } from 'react'
import { useRouter } from 'expo-router'
import { ScrollView } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import {
  ConversationSettingsSection,
  DeveloperSettingsSection,
  MemorySettingsSection,
  ModelSettingsSection,
  ProviderSettingsSection,
  SettingsHeader,
  settingsStyles as styles,
} from '../components/settings'
import { ACTIVE_GENERATION_STATUSES, BUSY_MODEL_STATUSES } from '../lib/settings/copy'
import { memoryService } from '../services/memory'
import { useStore } from '../store'

export default function Settings() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const modelSize = useStore((s) => s.modelSize)
  const modelStatus = useStore((s) => s.modelStatus)
  const modelError = useStore((s) => s.modelError)
  const generationStatus = useStore((s) => s.generationStatus)
  const providerMode = useStore((s) => s.providerMode)
  const manualProvider = useStore((s) => s.manualProvider)
  const voiceEnabled = useStore((s) => s.voiceEnabled)
  const rememberConversation = useStore((s) => s.rememberConversation)
  const devMode = useStore((s) => s.devMode)
  const memoryNotesCount = useStore((s) => s.memoryNotes.length)
  const memoryNotesStatus = useStore((s) => s.memoryNotesStatus)
  const memoryNotesError = useStore((s) => s.memoryNotesError)
  const lastExtractionSummary = useStore((s) => s.lastExtractionSummary)
  const setModelSize = useStore((s) => s.setModelSize)
  const setProviderMode = useStore((s) => s.setProviderMode)
  const setManualProvider = useStore((s) => s.setManualProvider)
  const setVoiceEnabled = useStore((s) => s.setVoiceEnabled)
  const setRememberConversation = useStore((s) => s.setRememberConversation)
  const setDevMode = useStore((s) => s.setDevMode)
  const loadModel = useStore((s) => s.loadModel)
  const unloadModel = useStore((s) => s.unloadModel)
  const startNewThread = useStore((s) => s.startNewThread)
  const modelBusy = BUSY_MODEL_STATUSES.includes(modelStatus)
  const generationBusy = ACTIVE_GENERATION_STATUSES.includes(generationStatus)

  useEffect(() => {
    void memoryService.listMemories()
  }, [])

  const handleLoadModel = useCallback(() => {
    void loadModel(modelSize).catch(() => undefined)
  }, [loadModel, modelSize])

  const handleUnloadModel = useCallback(() => {
    void unloadModel().catch(() => undefined)
  }, [unloadModel])

  const handleRefreshMemories = useCallback(() => {
    void memoryService.listMemories()
  }, [])

  const handleStartNewThread = useCallback(() => {
    if (generationBusy) return
    startNewThread()
    router.replace('/')
  }, [generationBusy, router, startNewThread])

  const handleOpenMemories = useCallback(() => {
    router.push('/memories')
  }, [router])

  const handleDone = useCallback(() => {
    if (router.canGoBack()) {
      router.back()
      return
    }
    router.replace('/')
  }, [router])

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 28 }]}
    >
      <SettingsHeader onDone={handleDone} />

      <ModelSettingsSection
        modelSize={modelSize}
        modelStatus={modelStatus}
        modelError={modelError}
        modelBusy={modelBusy}
        generationBusy={generationBusy}
        onSelectModel={setModelSize}
        onLoadModel={handleLoadModel}
        onUnloadModel={handleUnloadModel}
      />

      {devMode ? (
        <DeveloperSettingsSection
          modelSize={modelSize}
          modelStatus={modelStatus}
          modelError={modelError}
          generationStatus={generationStatus}
        />
      ) : null}

      <MemorySettingsSection
        memoryNotesCount={memoryNotesCount}
        memoryNotesStatus={memoryNotesStatus}
        memoryNotesError={memoryNotesError}
        lastExtractionSummary={lastExtractionSummary}
        onOpenMemories={handleOpenMemories}
        onRefreshMemories={handleRefreshMemories}
      />

      <ProviderSettingsSection
        providerMode={providerMode}
        manualProvider={manualProvider}
        onSelectProviderMode={setProviderMode}
        onSelectManualProvider={setManualProvider}
      />

      <ConversationSettingsSection
        voiceEnabled={voiceEnabled}
        rememberConversation={rememberConversation}
        devMode={devMode}
        onVoiceEnabledChange={setVoiceEnabled}
        onRememberConversationChange={setRememberConversation}
        onDevModeChange={setDevMode}
        generationBusy={generationBusy}
        onStartNewThread={handleStartNewThread}
      />
    </ScrollView>
  )
}
