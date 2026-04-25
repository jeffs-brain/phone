import { Text, View } from 'react-native'

import type { MemoryNotesStatus } from '../../store/slices/memory'
import type { ModelId, ModelStatus } from '../../store/slices/inference'
import type { ProviderMode } from '../../store/slices/settings'
import type { GenerationStatus, ProviderId } from '../../store/types'
import {
  formatStatusValue,
  friendlyModelError,
  memoryStatusCopy,
  modelActionLabel,
  MODEL_OPTIONS,
  modelLabel,
  PROVIDER_OPTIONS,
  runtimeProfileLabel,
  simulatorMultimodalDetail,
} from '../../lib/settings/copy'
import {
  ActionButton,
  DiagnosticRow,
  OptionButton,
  type SegmentOption,
  SegmentedControl,
  SettingsSection,
  SummaryPanel,
  ToggleRow,
} from './controls'
import { settingsStyles as styles } from './settings-styles'

const PROVIDER_MODE_OPTIONS = [
  { value: 'manual', label: '🔧 Manual' },
  { value: 'smart', label: '🤖 Smart' },
] as const satisfies readonly SegmentOption<ProviderMode>[]

export function ModelSettingsSection({
  modelSize,
  modelStatus,
  modelError,
  modelBusy,
  generationBusy,
  onSelectModel,
  onLoadModel,
  onUnloadModel,
}: {
  readonly modelSize: ModelId
  readonly modelStatus: ModelStatus
  readonly modelError: string | null
  readonly modelBusy: boolean
  readonly generationBusy: boolean
  readonly onSelectModel: (value: ModelId) => void
  readonly onLoadModel: () => void
  readonly onUnloadModel: () => void
}) {
  const disableModelChange = modelBusy || generationBusy

  return (
    <SettingsSection title="📦 AI Model">
      {MODEL_OPTIONS.map((option) => (
        <OptionButton
          key={option.value}
          value={option.value}
          label={option.label}
          detail={option.detail}
          selected={modelSize === option.value}
          onSelect={onSelectModel}
          disabled={disableModelChange}
        />
      ))}
      <View style={styles.actionRow}>
        <ActionButton label={modelActionLabel(modelStatus)} onPress={onLoadModel} disabled={modelBusy || generationBusy} />
        <ActionButton label="📤 Unload" onPress={onUnloadModel} muted disabled={modelBusy || generationBusy} />
      </View>
      {modelError === null ? null : <Text style={styles.errorText}>⚠️ {friendlyModelError(modelError)}</Text>}
    </SettingsSection>
  )
}

export function DeveloperSettingsSection({
  modelSize,
  modelStatus,
  modelError,
  generationStatus,
}: {
  readonly modelSize: ModelId
  readonly modelStatus: ModelStatus
  readonly modelError: string | null
  readonly generationStatus: GenerationStatus
}) {
  const modelStatusDetail = modelError === null ? undefined : friendlyModelError(modelError)

  return (
    <SettingsSection title="🔍 Developer">
      <DiagnosticRow label="Runtime profile" value={runtimeProfileLabel()} />
      <DiagnosticRow label="Selected model" value={modelLabel(modelSize)} detail={modelSize} />
      <DiagnosticRow label="Model status" value={formatStatusValue(modelStatus)} detail={modelStatusDetail} />
      <DiagnosticRow label="Generation status" value={formatStatusValue(generationStatus)} />
      <Text style={styles.diagnosticNote}>{simulatorMultimodalDetail()}</Text>
    </SettingsSection>
  )
}

export function MemorySettingsSection({
  memoryNotesCount,
  memoryNotesStatus,
  memoryNotesError,
  lastExtractionSummary,
  onOpenMemories,
  onRefreshMemories,
}: {
  readonly memoryNotesCount: number
  readonly memoryNotesStatus: MemoryNotesStatus
  readonly memoryNotesError: string | null
  readonly lastExtractionSummary: string | null
  readonly onOpenMemories: () => void
  readonly onRefreshMemories: () => void
}) {
  const memoryLoading = memoryNotesStatus === 'loading'

  return (
    <SettingsSection title="🧠 Memory">
      <SummaryPanel label="Stored memories" detail={memoryStatusCopy(memoryNotesStatus, memoryNotesCount)} />
      <View style={styles.actionRow}>
        <ActionButton label="🧠 Manage" onPress={onOpenMemories} />
        <ActionButton
          label={memoryLoading ? '🔄 Refreshing' : '🔄 Refresh'}
          onPress={onRefreshMemories}
          muted
          disabled={memoryLoading}
        />
      </View>
      {lastExtractionSummary === null ? null : (
        <DiagnosticRow label="Last extraction" value={lastExtractionSummary} />
      )}
      {memoryNotesError === null ? null : <Text style={styles.errorText}>⚠️ {memoryNotesError}</Text>}
    </SettingsSection>
  )
}

export function ProviderSettingsSection({
  providerMode,
  manualProvider,
  onSelectProviderMode,
  onSelectManualProvider,
}: {
  readonly providerMode: ProviderMode
  readonly manualProvider: ProviderId
  readonly onSelectProviderMode: (mode: ProviderMode) => void
  readonly onSelectManualProvider: (provider: ProviderId) => void
}) {
  return (
    <SettingsSection title="🔀 Provider">
      <SegmentedControl
        options={PROVIDER_MODE_OPTIONS}
        selectedValue={providerMode}
        onSelect={onSelectProviderMode}
      />

      {PROVIDER_OPTIONS.map((option) => (
        <OptionButton
          key={option.value}
          value={option.value}
          label={option.label}
          detail={option.detail}
          selected={manualProvider === option.value}
          onSelect={onSelectManualProvider}
        />
      ))}
    </SettingsSection>
  )
}

export function ConversationSettingsSection({
  voiceEnabled,
  rememberConversation,
  devMode,
  generationBusy,
  onVoiceEnabledChange,
  onRememberConversationChange,
  onDevModeChange,
  onStartNewThread,
}: {
  readonly voiceEnabled: boolean
  readonly rememberConversation: boolean
  readonly devMode: boolean
  readonly generationBusy: boolean
  readonly onVoiceEnabledChange: (enabled: boolean) => void
  readonly onRememberConversationChange: (enabled: boolean) => void
  readonly onDevModeChange: (enabled: boolean) => void
  readonly onStartNewThread: () => void
}) {
  return (
    <SettingsSection title="💬 Conversation">
      <ToggleRow
        label="Voice"
        detail="Mic uses Gradium STT; assistant replies can be played from each message"
        value={voiceEnabled}
        onValueChange={onVoiceEnabledChange}
      />
      <ToggleRow
        label="Remember conversations"
        detail="Keeps the memory extraction path enabled"
        value={rememberConversation}
        onValueChange={onRememberConversationChange}
      />
      <ToggleRow
        label="Dev mode"
        detail="Keeps demo diagnostics visible"
        value={devMode}
        onValueChange={onDevModeChange}
      />
      <ActionButton label="✨ New chat" onPress={onStartNewThread} muted disabled={generationBusy} />
    </SettingsSection>
  )
}
