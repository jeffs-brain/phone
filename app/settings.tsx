import { useCallback, useEffect, type ReactNode } from 'react'
import { useRouter } from 'expo-router'
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { INFERENCE_CONFIG } from '../lib/constants'
import { colors, radius, shadows, spacing, typography } from '../lib/theme'
import { memoryService } from '../services/memory'
import { useStore } from '../store'
import type { ModelId, ModelStatus } from '../store/slices/inference'
import type { GenerationStatus, ProviderId } from '../store/types'

const MODEL_OPTIONS: readonly { value: ModelId; label: string; detail: string }[] = [
  { value: 'gemma-4-E2B', label: 'Gemma 4 E2B', detail: 'Simulator and fallback model' },
  { value: 'gemma-4-E4B', label: 'Gemma 4 E4B', detail: 'Primary iPhone demo model' },
]

const PROVIDER_OPTIONS: readonly { value: ProviderId; label: string; detail: string }[] = [
  { value: 'gemma-local', label: 'Local Gemma', detail: 'Default private path' },
  { value: 'apple-fm', label: 'Apple FM', detail: 'Planned iOS 26 provider' },
  { value: 'cloud', label: 'Cloud', detail: 'Planned large-tier fallback' },
]

const BUSY_MODEL_STATUSES: readonly ModelStatus[] = ['checking', 'downloading', 'verifying', 'loaded', 'initialised']
const ACTIVE_GENERATION_STATUSES: readonly GenerationStatus[] = [
  'routing',
  'preparing-vision',
  'loading-first-token',
  'thinking',
  'using-tools',
  'streaming',
]

const formatBytes = (bytes: number): string => {
  if (bytes <= 0) return '0 MB'
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const formatDownload = (downloadBytes: { received: number; total: number } | null): string | null => {
  if (downloadBytes === null) return null
  if (downloadBytes.total <= 0) return `${formatBytes(downloadBytes.received)} processed`
  const percentage = Math.min(100, Math.round((downloadBytes.received / downloadBytes.total) * 100))
  return `${formatBytes(downloadBytes.received)} of ${formatBytes(downloadBytes.total)} (${percentage}%)`
}

const modelLabel = (id: ModelId): string => MODEL_OPTIONS.find((option) => option.value === id)?.label ?? id

const formatStatusValue = (status: ModelStatus | GenerationStatus): string =>
  status.replace(/-/g, ' ')

const memoryStatusCopy = (status: string, count: number): string => {
  if (status === 'loading') return count === 0 ? 'Loading stored memories' : 'Refreshing stored memories'
  if (count === 0) return 'No durable memories stored yet'
  return `${count} stored memor${count === 1 ? 'y' : 'ies'} on this phone`
}

const runtimeProfileLabel = (): string =>
  INFERENCE_CONFIG.PROFILE === 'simulator' ? 'Simulator' : 'Device'

const simulatorMultimodalDetail = (): string => {
  if (INFERENCE_CONFIG.PROFILE !== 'simulator') {
    return 'Real devices use the Metal projector for multimodal turns.'
  }
  if (INFERENCE_CONFIG.PROFILE === 'simulator' && INFERENCE_CONFIG.MULTIMODAL_USE_GPU) {
    return 'Simulator multimodal GPU is enabled with EXPO_PUBLIC_SIMULATOR_MULTIMODAL_GPU.'
  }
  return 'Simulator multimodal uses the CPU projector unless EXPO_PUBLIC_SIMULATOR_MULTIMODAL_GPU is enabled.'
}

const modelActionLabel = (modelStatus: ModelStatus): string => {
  if (modelStatus === 'error') return '🔄 Retry'
  if (BUSY_MODEL_STATUSES.includes(modelStatus)) return '⏳ Working...'
  if (modelStatus === 'ready') return '🔄 Reload'
  return '📦 Load model'
}

const friendlyModelError = (error: string): string => {
  const normalised = error.toLowerCase()
  if (normalised.includes('http 404')) return 'Model asset URL was not found. Check the configured GGUF URL.'
  if (normalised.includes('sha-256') || normalised.includes('checksum')) {
    return 'Cached model verification failed. Retry to repair the local file.'
  }
  if (normalised.includes('free') && normalised.includes('available')) {
    return 'There is not enough simulator storage for this model.'
  }
  if (normalised.includes('simulator projector gpu')) {
    return 'Simulator projector GPU crashed. CPU vision fallback is enabled for this install.'
  }
  if (normalised.includes('projector') || normalised.includes('initialise')) {
    return 'Native model initialisation failed. Try Gemma 4 E2B on the simulator.'
  }
  return error
}

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  )
}

function ToggleRow({
  label,
  detail,
  value,
  onValueChange,
}: {
  readonly label: string
  readonly detail: string
  readonly value: boolean
  readonly onValueChange: (value: boolean) => void
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleCopy}>
        <Text style={styles.optionLabel}>{label}</Text>
        <Text style={styles.optionDetail}>{detail}</Text>
      </View>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ false: '#EDE8E4', true: '#12B89E' }} />
    </View>
  )
}

function DiagnosticRow({
  label,
  value,
  detail,
}: {
  readonly label: string
  readonly value: string
  readonly detail?: string
}) {
  return (
    <View style={styles.diagnosticRow}>
      <Text style={styles.diagnosticLabel}>{label}</Text>
      <Text style={styles.diagnosticValue}>{value}</Text>
      {detail === undefined ? null : <Text style={styles.diagnosticDetail}>{detail}</Text>}
    </View>
  )
}

function ActionButton({
  label,
  onPress,
  muted = false,
  disabled = false,
}: {
  readonly label: string
  readonly onPress: () => void
  readonly muted?: boolean
  readonly disabled?: boolean
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        muted ? styles.mutedButton : null,
        disabled ? styles.disabledButton : null,
        pressed ? styles.pressed : null,
      ]}
    >
      <Text style={[styles.actionText, muted ? styles.mutedActionText : null, disabled ? styles.disabledText : null]}>
        {label}
      </Text>
    </Pressable>
  )
}

function OptionButton<T extends string>({
  label,
  detail,
  value,
  selected,
  onSelect,
}: {
  readonly label: string
  readonly detail: string
  readonly value: T
  readonly selected: boolean
  readonly onSelect: (value: T) => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onSelect(value)}
      style={({ pressed }) => [
        styles.optionButton,
        selected ? styles.selectedOption : null,
        pressed ? styles.pressed : null,
      ]}
    >
      <Text style={[styles.optionLabel, selected ? styles.selectedOptionText : null]}>{label}</Text>
      <Text style={[styles.optionDetail, selected ? styles.selectedOptionDetail : null]}>{detail}</Text>
    </Pressable>
  )
}

export default function Settings() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const modelSize = useStore((s) => s.modelSize)
  const modelStatus = useStore((s) => s.modelStatus)
  const modelError = useStore((s) => s.modelError)
  const downloadBytes = useStore((s) => s.downloadBytes)
  const generationStatus = useStore((s) => s.generationStatus)
  const providerMode = useStore((s) => s.providerMode)
  const manualProvider = useStore((s) => s.manualProvider)
  const voiceEnabled = useStore((s) => s.voiceEnabled)
  const rememberConversation = useStore((s) => s.rememberConversation)
  const devMode = useStore((s) => s.devMode)
  const memoryNotes = useStore((s) => s.memoryNotes)
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
  const selectedModel = modelLabel(modelSize)
  const modelStatusDetail = modelError === null ? undefined : friendlyModelError(modelError)
  const memoryLoading = memoryNotesStatus === 'loading'

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
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Settings</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={handleDone}
          style={({ pressed }) => [styles.doneButton, pressed ? styles.pressed : null]}
        >
          <Text style={styles.doneText}>✓ Done</Text>
        </Pressable>
      </View>

      <Section title="📦 AI Model">
        {MODEL_OPTIONS.map((option) => (
          <OptionButton
            key={option.value}
            value={option.value}
            label={option.label}
            detail={option.detail}
            selected={modelSize === option.value}
            onSelect={setModelSize}
          />
        ))}
        <View style={styles.actionRow}>
          <ActionButton label={modelActionLabel(modelStatus)} onPress={handleLoadModel} disabled={modelBusy} />
          <ActionButton label="📤 Unload" onPress={handleUnloadModel} muted disabled={modelBusy || generationBusy} />
        </View>
        {modelError === null ? null : <Text style={styles.errorText}>⚠️ {friendlyModelError(modelError)}</Text>}
      </Section>

      {devMode ? (
        <Section title="🔍 Developer">
          <DiagnosticRow label="Runtime profile" value={runtimeProfileLabel()} />
          <DiagnosticRow label="Selected model" value={selectedModel} detail={modelSize} />
          <DiagnosticRow label="Model status" value={formatStatusValue(modelStatus)} detail={modelStatusDetail} />
          <DiagnosticRow label="Generation status" value={formatStatusValue(generationStatus)} />
          <Text style={styles.diagnosticNote}>{simulatorMultimodalDetail()}</Text>
        </Section>
      ) : null}

      <Section title="🧠 Memory">
        <View style={styles.summaryPanel}>
          <View style={styles.summaryCopy}>
            <Text style={styles.optionLabel}>Stored memories</Text>
            <Text style={styles.optionDetail}>{memoryStatusCopy(memoryNotesStatus, memoryNotes.length)}</Text>
          </View>
        </View>
        <View style={styles.actionRow}>
          <ActionButton label="🧠 Manage" onPress={handleOpenMemories} />
          <ActionButton
            label={memoryLoading ? '🔄 Refreshing' : '🔄 Refresh'}
            onPress={handleRefreshMemories}
            muted
            disabled={memoryLoading}
          />
        </View>
        {lastExtractionSummary === null ? null : (
          <DiagnosticRow label="Last extraction" value={lastExtractionSummary} />
        )}
        {memoryNotesError === null ? null : <Text style={styles.errorText}>⚠️ {memoryNotesError}</Text>}
      </Section>

      <Section title="🔀 Provider">
        <View style={styles.segmented}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setProviderMode('manual')}
            style={[styles.segment, providerMode === 'manual' ? styles.selectedSegment : null]}
          >
            <Text style={[styles.segmentText, providerMode === 'manual' ? styles.selectedSegmentText : null]}>
              🔧 Manual
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => setProviderMode('smart')}
            style={[styles.segment, providerMode === 'smart' ? styles.selectedSegment : null]}
          >
            <Text style={[styles.segmentText, providerMode === 'smart' ? styles.selectedSegmentText : null]}>
              🤖 Smart
            </Text>
          </Pressable>
        </View>

        {PROVIDER_OPTIONS.map((option) => (
          <OptionButton
            key={option.value}
            value={option.value}
            label={option.label}
            detail={option.detail}
            selected={manualProvider === option.value}
            onSelect={setManualProvider}
          />
        ))}
      </Section>

      <Section title="💬 Conversation">
        <ToggleRow
          label="Voice"
          detail="Mic uses Gradium STT; assistant replies can be played from each message"
          value={voiceEnabled}
          onValueChange={setVoiceEnabled}
        />
        <ToggleRow
          label="Remember conversations"
          detail="Keeps the memory extraction path enabled"
          value={rememberConversation}
          onValueChange={setRememberConversation}
        />
        <ToggleRow
          label="Dev mode"
          detail="Keeps demo diagnostics visible"
          value={devMode}
          onValueChange={setDevMode}
        />
        <ActionButton label="✨ New chat" onPress={startNewThread} muted />
      </Section>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.bg.grouped,
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  headerCopy: {
    flex: 1,
    paddingRight: 14,
  },
  title: {
    color: colors.text.primary,
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: 0,
  },
  doneButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  doneText: {
    color: colors.accent.teal,
    fontSize: 17,
    fontWeight: '600',
  },
  section: {
    backgroundColor: colors.bg.card,
    borderRadius: radius.md,
    gap: 12,
    marginBottom: 16,
    paddingHorizontal: 20,
    paddingVertical: 20,
    ...shadows[1],
  },
  sectionTitle: {
    color: colors.text.primary,
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 2,
  },
  optionButton: {
    backgroundColor: colors.bg.card,
    borderColor: colors.divider,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  selectedOption: {
    backgroundColor: colors.button.selected.bg,
    borderColor: colors.button.selected.border,
  },
  optionLabel: {
    color: colors.text.primary,
    fontSize: 15,
    fontWeight: '600',
  },
  selectedOptionText: {
    color: colors.accent.teal,
  },
  optionDetail: {
    color: colors.text.secondary,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3,
  },
  selectedOptionDetail: {
    color: colors.accent.teal,
  },
  summaryPanel: {
    backgroundColor: colors.bg.card,
    borderColor: colors.divider,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  summaryCopy: {
    gap: 2,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    alignItems: 'center',
    backgroundColor: colors.accent.teal,
    borderRadius: radius.sm,
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  actionText: {
    color: colors.text.onAccent,
    fontSize: 14,
    fontWeight: '600',
  },
  mutedButton: {
    backgroundColor: colors.bg.secondary,
  },
  disabledButton: {
    opacity: 0.52,
  },
  mutedActionText: {
    color: colors.text.primary,
  },
  disabledText: {
    color: colors.text.secondary,
  },
  errorText: {
    color: colors.accent.error,
    fontSize: 13,
    lineHeight: 18,
  },
  segmented: {
    backgroundColor: colors.bg.secondary,
    borderRadius: radius.md,
    flexDirection: 'row',
    padding: 4,
  },
  segment: {
    alignItems: 'center',
    borderRadius: radius.sm,
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
  },
  selectedSegment: {
    backgroundColor: colors.accent.teal,
  },
  segmentText: {
    color: colors.text.secondary,
    fontSize: 14,
    fontWeight: '600',
  },
  selectedSegmentText: {
    color: colors.text.onAccent,
  },
  toggleRow: {
    alignItems: 'center',
    backgroundColor: colors.bg.card,
    borderColor: colors.divider,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 66,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  toggleCopy: {
    flex: 1,
    paddingRight: 12,
  },
  diagnosticRow: {
    backgroundColor: colors.bg.card,
    borderColor: colors.divider,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  diagnosticLabel: {
    color: colors.text.secondary,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  diagnosticValue: {
    color: colors.text.primary,
    fontSize: 15,
    fontWeight: '600',
    marginTop: 4,
  },
  diagnosticDetail: {
    color: colors.text.secondary,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3,
  },
  diagnosticNote: {
    color: colors.text.secondary,
    fontSize: 13,
    lineHeight: 18,
  },
  pressed: {
    opacity: 0.72,
  },
})
