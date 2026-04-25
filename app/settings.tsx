import { useCallback, type ReactNode } from 'react'
import { useRouter } from 'expo-router'
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

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

const modelActionLabel = (modelStatus: ModelStatus): string => {
  if (modelStatus === 'error') return 'Retry model'
  if (BUSY_MODEL_STATUSES.includes(modelStatus)) return 'Working...'
  if (modelStatus === 'ready') return 'Reload model'
  return 'Load model'
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
      <Switch value={value} onValueChange={onValueChange} />
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
  const setModelSize = useStore((s) => s.setModelSize)
  const setProviderMode = useStore((s) => s.setProviderMode)
  const setManualProvider = useStore((s) => s.setManualProvider)
  const setVoiceEnabled = useStore((s) => s.setVoiceEnabled)
  const setRememberConversation = useStore((s) => s.setRememberConversation)
  const setDevMode = useStore((s) => s.setDevMode)
  const loadModel = useStore((s) => s.loadModel)
  const unloadModel = useStore((s) => s.unloadModel)
  const clearMessages = useStore((s) => s.clearMessages)
  const modelBusy = BUSY_MODEL_STATUSES.includes(modelStatus)
  const generationBusy = ACTIVE_GENERATION_STATUSES.includes(generationStatus)
  const downloadDetail = formatDownload(downloadBytes)

  const handleLoadModel = useCallback(() => {
    void loadModel(modelSize).catch(() => undefined)
  }, [loadModel, modelSize])

  const handleUnloadModel = useCallback(() => {
    void unloadModel().catch(() => undefined)
  }, [unloadModel])

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 28 }]}
    >
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>Jeff Phone</Text>
          <Text style={styles.title}>Settings</Text>
          <Text style={styles.subtitle}>Model status: {modelStatus}</Text>
          {downloadDetail === null ? null : <Text style={styles.subtitle}>{downloadDetail}</Text>}
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.doneButton, pressed ? styles.pressed : null]}
        >
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
      </View>

      <Section title="Local Model">
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
          <ActionButton label="Unload" onPress={handleUnloadModel} muted disabled={modelBusy || generationBusy} />
        </View>
        {modelError === null ? null : <Text style={styles.errorText}>{friendlyModelError(modelError)}</Text>}
      </Section>

      <Section title="Provider Mode">
        <View style={styles.segmented}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setProviderMode('manual')}
            style={[styles.segment, providerMode === 'manual' ? styles.selectedSegment : null]}
          >
            <Text style={[styles.segmentText, providerMode === 'manual' ? styles.selectedSegmentText : null]}>
              Manual
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => setProviderMode('smart')}
            style={[styles.segment, providerMode === 'smart' ? styles.selectedSegment : null]}
          >
            <Text style={[styles.segmentText, providerMode === 'smart' ? styles.selectedSegmentText : null]}>
              Smart
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

      <Section title="Conversation">
        <ToggleRow
          label="Voice"
          detail="Shows the voice path while Gradium wiring lands"
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
        <ActionButton label="Clear chat" onPress={clearMessages} muted />
      </Section>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: '#080a0f',
    flex: 1,
  },
  content: {
    paddingHorizontal: 18,
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
  eyebrow: {
    color: '#8b93a7',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  title: {
    color: '#f6f7fb',
    fontSize: 31,
    fontWeight: '800',
    letterSpacing: 0,
    marginTop: 2,
  },
  subtitle: {
    color: '#9aa3b5',
    fontSize: 13,
    marginTop: 3,
  },
  doneButton: {
    backgroundColor: '#171b25',
    borderColor: '#2d3444',
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  doneText: {
    color: '#f4f7fb',
    fontSize: 14,
    fontWeight: '800',
  },
  section: {
    borderTopColor: '#1c2230',
    borderTopWidth: 1,
    gap: 10,
    paddingVertical: 18,
  },
  sectionTitle: {
    color: '#f4f7fb',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 2,
  },
  optionButton: {
    backgroundColor: '#10141d',
    borderColor: '#252b3a',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  selectedOption: {
    backgroundColor: '#16231f',
    borderColor: '#3f8f7d',
  },
  optionLabel: {
    color: '#f4f7fb',
    fontSize: 15,
    fontWeight: '800',
  },
  selectedOptionText: {
    color: '#c8f7e8',
  },
  optionDetail: {
    color: '#9aa3b5',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3,
  },
  selectedOptionDetail: {
    color: '#8fcbb9',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    alignItems: 'center',
    backgroundColor: '#8be9d4',
    borderRadius: 8,
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  actionText: {
    color: '#07110f',
    fontSize: 14,
    fontWeight: '900',
  },
  mutedButton: {
    backgroundColor: '#171b25',
    borderColor: '#2d3444',
    borderWidth: 1,
  },
  disabledButton: {
    opacity: 0.52,
  },
  mutedActionText: {
    color: '#f4f7fb',
  },
  disabledText: {
    color: '#9aa3b5',
  },
  errorText: {
    color: '#ff9b9b',
    fontSize: 13,
    lineHeight: 18,
  },
  segmented: {
    backgroundColor: '#10141d',
    borderColor: '#252b3a',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    padding: 4,
  },
  segment: {
    alignItems: 'center',
    borderRadius: 6,
    flex: 1,
    minHeight: 40,
    justifyContent: 'center',
  },
  selectedSegment: {
    backgroundColor: '#f4f7fb',
  },
  segmentText: {
    color: '#9aa3b5',
    fontSize: 14,
    fontWeight: '800',
  },
  selectedSegmentText: {
    color: '#07110f',
  },
  toggleRow: {
    alignItems: 'center',
    backgroundColor: '#10141d',
    borderColor: '#252b3a',
    borderRadius: 8,
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
  pressed: {
    opacity: 0.72,
  },
})
