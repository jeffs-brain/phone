import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass'
import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system/legacy'
import * as ImagePicker from 'expo-image-picker'
import { useRouter } from 'expo-router'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ColorValue,
  type ListRenderItemInfo,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { hapticAttachment, hapticButton, hapticSend } from '../lib/haptics'
import { colors, radius, shadows, spacing, typography } from '../lib/theme'
import { useStore } from '../store'
import type { ModelStatus } from '../store/slices/inference'
import type { VoiceStatus } from '../store/slices/voice'
import type { ContentPart, GenerationStatus, Message, ProviderId, RouteDecision, ToolCall } from '../store/types'

const ACTIVE_GENERATION_STATUSES: readonly GenerationStatus[] = [
  'routing',
  'preparing-vision',
  'loading-first-token',
  'thinking',
  'using-tools',
  'streaming',
]

const PROVIDER_LABELS: Record<ProviderId, string> = {
  'gemma-local': 'On-device Gemma',
  'apple-fm': 'Apple Foundation',
  cloud: 'Cloud',
}

const MODEL_STATUS_LABELS: Record<ModelStatus, string> = {
  unloaded: 'Model unloaded',
  checking: 'Checking model',
  downloading: 'Downloading model',
  verifying: 'Verifying model',
  loaded: 'Model downloaded',
  initialised: 'Initialising model',
  ready: 'Model ready',
  error: 'Model error',
}

const GENERATION_STATUS_LABELS: Record<GenerationStatus, string> = {
  idle: 'Idle',
  routing: '\u{1F500} Routing',
  'preparing-vision': 'Preparing vision',
  'loading-first-token': 'Loading first token',
  thinking: '\u{1F914} Thinking',
  'using-tools': '\u{1F527} Using tools',
  streaming: '⚡ Streaming',
  done: 'Done',
  error: 'Generation error',
}

const VOICE_STATUS_LABELS: Record<VoiceStatus, string> = {
  idle: 'Voice ready',
  'requesting-permission': 'Requesting mic',
  connecting: 'Connecting to Gradium',
  listening: '\u{1F442} Listening',
  'ending-turn': 'Ending turn',
  transcribing: '✍️ Transcribing',
  sending: 'Sending to Jeff',
  speaking: '\u{1F50A} Speaking',
  error: 'Voice error',
}

const VOICE_BUSY_STATUSES: readonly VoiceStatus[] = [
  'requesting-permission',
  'connecting',
  'listening',
  'ending-turn',
  'transcribing',
  'sending',
]

const MODEL_LABELS = {
  'gemma-4-E2B': 'Gemma 4 E2B',
  'gemma-4-E4B': 'Gemma 4 E4B',
} as const

const TEXT_FILE_MAX_BYTES = 256 * 1024
const TEXT_FILE_EXTENSIONS = [
  '.txt',
  '.md',
  '.markdown',
  '.json',
  '.csv',
  '.tsv',
  '.xml',
  '.yaml',
  '.yml',
  '.log',
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.py',
  '.rb',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.swift',
  '.c',
  '.cpp',
  '.h',
  '.hpp',
  '.sql',
] as const
const SUPPORTED_LLAMA_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.bmp', '.gif'] as const
const SUPPORTED_LLAMA_IMAGE_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/bmp', 'image/gif'] as const

const STATUS_DOT_COLOURS: Record<string, string> = {
  ready: colors.accent.success,
  downloading: colors.accent.warning,
  checking: colors.accent.warning,
  verifying: colors.accent.warning,
  loaded: colors.accent.warning,
  initialised: colors.accent.warning,
  error: colors.accent.error,
  unloaded: colors.text.muted,
}

type ThinkingDetail = {
  readonly status: string
  readonly text: string
}

type ImageContentPart = Extract<ContentPart, { type: 'image' }>

type StructuredThinking = {
  readonly status?: unknown
  readonly text?: unknown
}

type AttachmentWithDisplayName = ContentPart & {
  readonly fileName?: unknown
  readonly name?: unknown
}

type GlassSurfaceProps = {
  readonly children: ReactNode
  readonly style?: StyleProp<ViewStyle>
  readonly effect?: 'clear' | 'regular'
  readonly tintColor?: ColorValue
}

const imagePartFromLibraryAsset = (asset: ImagePicker.ImagePickerAsset): ImageContentPart => ({
  type: 'image',
  uri: asset.uri,
  name: asset.fileName ?? undefined,
  mimeType: asset.mimeType ?? undefined,
  width: asset.width,
  height: asset.height,
})

const imagePartFromDocumentAsset = (asset: DocumentPicker.DocumentPickerAsset): ImageContentPart => ({
  type: 'image',
  uri: asset.uri,
  name: asset.name,
  mimeType: asset.mimeType,
})

const isSupportedLlamaImage = (part: ImageContentPart): boolean => {
  const mimeType = part.mimeType?.toLowerCase()
  if (
    mimeType !== undefined &&
    SUPPORTED_LLAMA_IMAGE_MIME_TYPES.some((supported) => supported === mimeType)
  ) {
    return true
  }

  const name = (part.name ?? part.uri).toLowerCase()
  return SUPPORTED_LLAMA_IMAGE_EXTENSIONS.some((extension) => name.endsWith(extension))
}

const assertReadableLlamaImage = async (part: ImageContentPart): Promise<ImageContentPart> => {
  const info = await FileSystem.getInfoAsync(part.uri)
  if (!info.exists || info.isDirectory) {
    throw new Error('Selected image could not be read.')
  }
  if ('size' in info && typeof info.size === 'number' && info.size <= 0) {
    throw new Error('Selected image is empty.')
  }
  if (!isSupportedLlamaImage(part)) {
    throw new Error('Choose a JPEG, PNG, BMP, or GIF image.')
  }
  return part
}

const formatContentPart = (part: ContentPart): string => {
  if (part.type === 'text') return part.text
  if (part.type === 'image') return ''
  return `Audio attached (${Math.round(part.durationMs / 1000)}s)`
}

const formatBytes = (bytes: number): string => {
  if (bytes <= 0) return '0 MB'
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const formatDownload = (downloadBytes: { received: number; total: number } | null): string | null => {
  if (downloadBytes === null) return null
  if (downloadBytes.total <= 0) return `${formatBytes(downloadBytes.received)} downloaded`
  const percentage = Math.min(100, Math.round((downloadBytes.received / downloadBytes.total) * 100))
  return `${formatBytes(downloadBytes.received)} of ${formatBytes(downloadBytes.total)} (${percentage}%)`
}

const friendlyModelError = (error: string | null): string => {
  if (error === null) return 'Open settings to retry loading the local model'
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
    return 'Native model initialisation failed. Retry, or use Gemma 4 E2B for the simulator.'
  }
  return error
}

const isGenerationActive = (status: GenerationStatus): boolean => ACTIVE_GENERATION_STATUSES.includes(status)

const isStructuredThinking = (value: unknown): value is StructuredThinking => (
  typeof value === 'object' && value !== null
)

const getThinkingDetail = (thinking: unknown): ThinkingDetail | null => {
  if (typeof thinking === 'string') {
    const text = thinking.trim()
    return text === '' ? null : { status: 'Thinking', text }
  }

  if (!isStructuredThinking(thinking)) return null

  const text = typeof thinking.text === 'string' ? thinking.text.trim() : ''
  const status = thinking.status === 'done' ? 'Thoughts' : 'Thinking'

  if (text === '') return null
  return { status, text }
}

const getMessageText = (message: Message): string => {
  if (message.streamingText !== undefined) return message.streamingText
  return message.parts.map(formatContentPart).filter((part) => part.trim() !== '').join('\n\n')
}

const getImageParts = (message: Message): Extract<ContentPart, { type: 'image' }>[] =>
  message.parts.filter((part): part is Extract<ContentPart, { type: 'image' }> => part.type === 'image')

const getRoleLabel = (role: Message['role']): string => {
  if (role === 'user') return 'You'
  if (role === 'assistant') return 'Jeff'
  if (role === 'tool') return 'Tool'
  return 'System'
}

const toolCallLabel = (toolCall: ToolCall): string => {
  if (toolCall.status === 'done') return `${toolCall.name} done`
  if (toolCall.status === 'error') return `${toolCall.name} failed`
  return `${toolCall.name} ${toolCall.status}`
}

const getModelDetail = (
  modelStatus: ModelStatus,
  modelSize: keyof typeof MODEL_LABELS,
  downloadBytes: { received: number; total: number } | null,
  modelError: string | null,
): string => {
  const download = formatDownload(downloadBytes)
  if (modelStatus === 'checking') return download ?? 'Checking cached files'
  if (modelStatus === 'downloading') return download ?? 'Download starting'
  if (modelStatus === 'verifying') return download === null ? 'Checking downloaded bytes' : `${download} verified`
  if (modelStatus === 'unloaded') return `${MODEL_LABELS[modelSize]} selected`
  if (modelStatus === 'ready') return `${MODEL_LABELS[modelSize]} is ready on this phone`
  if (modelStatus === 'loaded') return `${MODEL_LABELS[modelSize]} downloaded`
  if (modelStatus === 'initialised') return `${MODEL_LABELS[modelSize]} is initialising`
  return friendlyModelError(modelError)
}

const getAttachmentDisplayName = (part: ContentPart): string | null => {
  const namedPart = part as AttachmentWithDisplayName
  const name = namedPart.fileName ?? namedPart.name
  if (typeof name !== 'string') return null

  const trimmed = name.trim()
  return trimmed === '' ? null : trimmed
}

const getStagedAttachmentLabel = (part: ContentPart, index: number): string => {
  const name = getAttachmentDisplayName(part)
  if (name !== null) return name
  if (part.type === 'image') return `Image ${index + 1}`
  if (part.type === 'audio') return `Audio ${Math.round(part.durationMs / 1000)}s`
  if (part.type === 'text') {
    const text = part.text.trim()
    return text === '' ? `Text ${index + 1}` : text
  }
  return `File ${index + 1}`
}

const getStagedAttachmentKey = (part: ContentPart, index: number): string => {
  if (part.type === 'image' || part.type === 'audio') return `${part.type}-${part.uri}-${index}`
  if (part.type === 'text') return `${part.type}-${part.text}-${index}`
  return `attachment-${index}`
}

const isTextDocument = (asset: DocumentPicker.DocumentPickerAsset): boolean => {
  const mimeType = asset.mimeType?.toLowerCase()
  if (mimeType?.startsWith('text/') === true) return true
  if (
    mimeType === 'application/json' ||
    mimeType === 'application/xml' ||
    mimeType === 'application/yaml' ||
    mimeType === 'application/x-yaml' ||
    mimeType === 'text/markdown'
  ) {
    return true
  }

  const lowerName = asset.name.toLowerCase()
  return TEXT_FILE_EXTENSIONS.some((extension) => lowerName.endsWith(extension))
}

const textPartFromDocument = async (asset: DocumentPicker.DocumentPickerAsset): Promise<ContentPart> => {
  if (!isTextDocument(asset)) {
    throw new Error(`${asset.name} is not a text file Jeff can read yet.`)
  }

  if (asset.size !== undefined && asset.size > TEXT_FILE_MAX_BYTES) {
    throw new Error(`${asset.name} is larger than ${Math.round(TEXT_FILE_MAX_BYTES / 1024)} KB.`)
  }

  const info = await FileSystem.getInfoAsync(asset.uri)
  if (!info.exists || info.isDirectory) {
    throw new Error(`${asset.name} could not be read.`)
  }
  if ('size' in info && typeof info.size === 'number' && info.size > TEXT_FILE_MAX_BYTES) {
    throw new Error(`${asset.name} is larger than ${Math.round(TEXT_FILE_MAX_BYTES / 1024)} KB.`)
  }

  const text = await FileSystem.readAsStringAsync(asset.uri, {
    encoding: FileSystem.EncodingType.UTF8,
  })
  const trimmed = text.trim()
  if (trimmed === '') throw new Error(`${asset.name} is empty.`)

  const header = [
    `Attached file: ${asset.name}`,
    asset.mimeType === undefined ? null : `MIME type: ${asset.mimeType}`,
  ].filter((line): line is string => line !== null)

  return {
    type: 'text',
    text: `${header.join('\n')}\n\n${trimmed}`,
  }
}

function ProviderBadge({
  decision,
  modelSize,
}: {
  readonly decision: RouteDecision | null
  readonly modelSize: keyof typeof MODEL_LABELS
}) {
  const label = decision === null ? 'Provider pending' : PROVIDER_LABELS[decision.provider]
  const routeDetail = decision === null
    ? 'Send a message to route'
    : `${decision.routed ? 'Smart route' : 'Manual'} · ${decision.tier} · ${Math.round(decision.confidence * 100)}%`
  const detail = decision?.provider === 'gemma-local' || decision === null
    ? `${routeDetail} · ${MODEL_LABELS[modelSize]}`
    : routeDetail

  return (
    <View style={styles.providerBadge}>
      <Text style={styles.providerLabel}>{label}</Text>
      <Text style={styles.providerDetail}>{detail}</Text>
    </View>
  )
}

function EmptyState({ onSuggestion }: { readonly onSuggestion: (text: string) => void }) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyAvatar}>
        <Text style={styles.emptyAvatarText}>J</Text>
      </View>
      <Text style={styles.emptyTitle}>Hey, I'm Jeff {'\u{1F4AC}'}</Text>
      <Text style={styles.emptyCopy}>Your private on-device brain. Everything stays on this phone.</Text>
      <View style={styles.suggestionRow}>
        <Pressable
          accessibilityRole="button"
          onPress={() => { hapticButton(); onSuggestion('Tell me something interesting') }}
          style={({ pressed }) => [styles.suggestionChip, pressed ? styles.pressed : null]}
        >
          <Text style={styles.suggestionChipText}>Tell me something interesting</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => { hapticButton(); onSuggestion('What can you do?') }}
          style={({ pressed }) => [styles.suggestionChip, pressed ? styles.pressed : null]}
        >
          <Text style={styles.suggestionChipText}>What can you do?</Text>
        </Pressable>
      </View>
    </View>
  )
}

function GlassSurface({
  children,
  style,
  effect = 'regular',
  tintColor = 'rgba(243, 239, 236, 0.72)',
}: GlassSurfaceProps) {
  const surfaceStyle = [
    styles.glassSurface,
    isLiquidGlassSupported ? styles.glassSurfaceNative : styles.glassSurfaceFallback,
    style,
  ]

  if (isLiquidGlassSupported) {
    return (
      <LiquidGlassView
        colorScheme="light"
        effect={effect}
        interactive
        style={surfaceStyle}
        tintColor={tintColor}
      >
        {children}
      </LiquidGlassView>
    )
  }

  return <View style={surfaceStyle}>{children}</View>
}

function ThinkingDisclosure({ thinking }: { thinking: ThinkingDetail }) {
  const [expanded, setExpanded] = useState(false)
  const hasDetail = thinking.text !== ''

  return (
    <View style={styles.thinkingPanel}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded, disabled: !hasDetail }}
        disabled={!hasDetail}
        onPress={() => setExpanded((value) => !value)}
        style={({ pressed }) => [
          styles.thinkingToggle,
          !hasDetail ? styles.thinkingToggleStatic : null,
          pressed ? styles.pressed : null,
        ]}
      >
        <Text style={styles.thinkingStatus}>{thinking.status}</Text>
        {hasDetail ? (
          <Text style={styles.thinkingToggleText}>{expanded ? '▼' : '▶'}</Text>
        ) : null}
      </Pressable>
      {expanded && hasDetail ? (
        <Text style={styles.thinkingText}>{thinking.text}</Text>
      ) : null}
    </View>
  )
}

function StagedAttachmentPreview({
  index,
  onRemove,
  part,
}: {
  readonly index: number
  readonly onRemove: (index: number) => void
  readonly part: ContentPart
}) {
  const label = getStagedAttachmentLabel(part, index)

  return (
    <View style={styles.stagedAttachment}>
      {part.type === 'image' ? (
        <Image
          resizeMode="cover"
          source={{ uri: part.uri }}
          style={styles.stagedImage}
        />
      ) : (
        <View style={styles.stagedFilePreview}>
          <Text style={styles.stagedFilePreviewText}>File</Text>
        </View>
      )}
      <Text numberOfLines={1} style={styles.stagedAttachmentLabel}>{label}</Text>
      <Pressable
        accessibilityLabel={`Remove ${label}`}
        accessibilityRole="button"
        hitSlop={8}
        onPress={() => onRemove(index)}
        style={({ pressed }) => [styles.stagedRemoveButton, pressed ? styles.pressed : null]}
      >
        <Text style={styles.stagedRemoveText}>X</Text>
      </Pressable>
    </View>
  )
}

function StagedAttachmentTray({
  attachments,
  onClear,
  onRemove,
}: {
  readonly attachments: readonly ContentPart[]
  readonly onClear: () => void
  readonly onRemove: (index: number) => void
}) {
  if (attachments.length === 0) return null

  return (
    <View style={styles.stagedTray}>
      <View style={styles.stagedTrayHeader}>
        <Text style={styles.stagedTrayTitle}>
          {attachments.length === 1 ? '1 attachment' : `${attachments.length} attachments`}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => { hapticButton(); onClear() }}
          style={({ pressed }) => [styles.clearStagedButton, pressed ? styles.pressed : null]}
        >
          <Text style={styles.clearStagedText}>{'\u{1F5D1}️'}</Text>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        keyboardShouldPersistTaps="handled"
        showsHorizontalScrollIndicator={false}
        style={styles.stagedScroller}
      >
        {attachments.map((part, index) => (
          <StagedAttachmentPreview
            index={index}
            key={getStagedAttachmentKey(part, index)}
            onRemove={onRemove}
            part={part}
          />
        ))}
      </ScrollView>
    </View>
  )
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'
  const isAssistant = message.role === 'assistant'
  const voiceEnabled = useStore((s) => s.voiceEnabled)
  const voiceStatus = useStore((s) => s.voiceStatus)
  const ttsCurrent = useStore((s) => s.ttsCurrent)
  const speakMessage = useStore((s) => s.speakMessage)
  const stopSpeech = useStore((s) => s.stopSpeech)
  const text = getMessageText(message)
  const thinking = isAssistant ? getThinkingDetail(message.thinking) : null
  const images = getImageParts(message)
  const hasAnswer = text.trim() !== ''
  const displayText = hasAnswer ? text : 'Thinking...'
  const showAnswerText = hasAnswer || (isAssistant && thinking === null && images.length === 0)
  const isSpeakingThisMessage = voiceStatus === 'speaking' && ttsCurrent?.messageId === message.id
  const canSpeakMessage = isAssistant && voiceEnabled && hasAnswer && message.streamingText === undefined
  const speechDisabled = !canSpeakMessage || (voiceStatus !== 'idle' && !isSpeakingThisMessage)

  const handleSpeechPress = useCallback(() => {
    if (isSpeakingThisMessage) {
      stopSpeech()
      return
    }

    if (speechDisabled) return
    hapticButton()
    void speakMessage({ messageId: message.id, text })
  }, [isSpeakingThisMessage, message.id, speakMessage, speechDisabled, stopSpeech, text])

  return (
    <View style={[styles.messageRow, isUser ? styles.messageRowUser : styles.messageRowAssistant]}>
      <View style={[
        styles.messageBubble,
        isUser ? styles.userBubble : styles.assistantBubble,
        message.role === 'tool' ? styles.toolBubble : null,
        message.role === 'system' ? styles.systemBubble : null,
      ]}>
        <View style={styles.messageMetaRow}>
          <View style={styles.messageMetaActions}>
            {canSpeakMessage ? (
              <Pressable
                accessibilityLabel={isSpeakingThisMessage ? 'Stop speaking this message' : 'Speak this message'}
                accessibilityRole="button"
                accessibilityState={{ disabled: speechDisabled, selected: isSpeakingThisMessage }}
                disabled={speechDisabled}
                onPress={handleSpeechPress}
                style={({ pressed }) => [
                  styles.speechButton,
                  isSpeakingThisMessage ? styles.speechButtonActive : null,
                  speechDisabled ? styles.speechButtonDisabled : null,
                  pressed ? styles.pressed : null,
                ]}
              >
                <Text style={[
                  styles.speechButtonText,
                  isSpeakingThisMessage ? styles.speechButtonTextActive : null,
                  speechDisabled ? styles.speechButtonTextDisabled : null,
                ]}>
                  {isSpeakingThisMessage ? '⏹️' : '\u{1F50A}'}
                </Text>
              </Pressable>
            ) : null}
            {message.routeDecision === undefined ? null : (
              <Text style={styles.messageRoute}>{PROVIDER_LABELS[message.routeDecision.provider]}</Text>
            )}
          </View>
        </View>
        {thinking === null ? null : <ThinkingDisclosure thinking={thinking} />}
        {message.toolCalls === undefined || message.toolCalls.length === 0 ? null : (
          <View style={styles.toolCallStrip}>
            {message.toolCalls.map((toolCall) => (
              <Text key={toolCall.id} style={styles.toolCallText}>
                {toolCallLabel(toolCall)}
              </Text>
            ))}
          </View>
        )}
        {images.length === 0 ? null : (
          <View style={styles.messageImageGrid}>
            {images.map((part, index) => (
              <Image
                key={`${part.uri}-${index}`}
                resizeMode="cover"
                source={{ uri: part.uri }}
                style={styles.messageImage}
              />
            ))}
          </View>
        )}
        {showAnswerText ? (
          <Text style={[styles.messageText, isUser ? styles.userMessageText : null]}>
            {displayText}
          </Text>
        ) : null}
        {message.routeDecision === undefined ? null : (
          <Text style={styles.routeDetail}>
            {message.routeDecision.label} · {Math.round(message.routeDecision.latencyMs)}ms
          </Text>
        )}
      </View>
    </View>
  )
}

export default function Chat() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const listRef = useRef<FlatList<Message>>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [storeHydrated, setStoreHydrated] = useState(() => useStore.persist.hasHydrated())

  const messages = useStore((s) => s.messages)
  const draft = useStore((s) => s.draft)
  const setDraft = useStore((s) => s.setDraft)
  const sendUserMessage = useStore((s) => s.sendUserMessage)
  const startNewThread = useStore((s) => s.startNewThread)
  const loadModel = useStore((s) => s.loadModel)
  const stagedAttachments = useStore((s) => s.stagedAttachments)
  const stageAttachment = useStore((s) => s.stageAttachment)
  const removeStagedAttachment = useStore((s) => s.removeStagedAttachment)
  const clearStaged = useStore((s) => s.clearStaged)
  const generationStatus = useStore((s) => s.generationStatus)
  const modelStatus = useStore((s) => s.modelStatus)
  const modelError = useStore((s) => s.modelError)
  const downloadBytes = useStore((s) => s.downloadBytes)
  const cancelGeneration = useStore((s) => s.cancelGeneration)
  const lastDecision = useStore((s) => s.lastDecision)
  const modelId = useStore((s) => s.modelId)
  const modelSize = useStore((s) => s.modelSize)
  const setModelSize = useStore((s) => s.setModelSize)
  const voiceEnabled = useStore((s) => s.voiceEnabled)
  const voiceStatus = useStore((s) => s.voiceStatus)
  const asrPartial = useStore((s) => s.asrPartial)
  const voiceError = useStore((s) => s.voiceError)
  const startRecording = useStore((s) => s.startRecording)
  const stopRecording = useStore((s) => s.stopRecording)
  const cancelVoice = useStore((s) => s.cancelVoice)
  const stopSpeech = useStore((s) => s.stopSpeech)

  const generationActive = isGenerationActive(generationStatus)
  const voiceBusy = VOICE_BUSY_STATUSES.includes(voiceStatus)
  const voiceCanPress = voiceEnabled
    && !generationActive
    && voiceStatus !== 'ending-turn'
    && voiceStatus !== 'transcribing'
    && voiceStatus !== 'sending'
  const hasComposerContent = draft.trim().length > 0 || stagedAttachments.length > 0
  const canSend = hasComposerContent && !generationActive && !voiceBusy
  const voiceTranscript = asrPartial.trim()
  const showVoiceTray = voiceStatus !== 'idle' || voiceError !== null || voiceTranscript !== ''
  const modelDetail = useMemo(
    () => getModelDetail(modelStatus, modelSize, downloadBytes, modelError),
    [downloadBytes, modelError, modelSize, modelStatus],
  )

  const statusDotColour = STATUS_DOT_COLOURS[modelStatus] ?? colors.text.muted
  const statusPillLabel = generationActive
    ? `${MODEL_STATUS_LABELS[modelStatus]} · ${GENERATION_STATUS_LABELS[generationStatus].toLowerCase()}`
    : MODEL_STATUS_LABELS[modelStatus]

  useEffect(() => {
    if (storeHydrated) return undefined
    const unsubscribe = useStore.persist.onFinishHydration(() => setStoreHydrated(true))
    return unsubscribe
  }, [storeHydrated])

  useEffect(() => {
    if (!storeHydrated || modelStatus !== 'unloaded' || generationActive) return
    void loadModel(modelSize).catch(() => {
      setActionError('Could not auto-load the local model.')
    })
  }, [generationActive, loadModel, modelSize, modelStatus, storeHydrated])

  const scrollToEnd = useCallback(() => {
    if (messages.length === 0) return
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }))
  }, [messages.length])

  const handleSend = useCallback(() => {
    if (!canSend) return
    hapticSend()
    setActionError(null)
    if (voiceStatus === 'speaking') stopSpeech()
    void sendUserMessage().catch(() => {
      setActionError('Could not send that message.')
    })
  }, [canSend, sendUserMessage, stopSpeech, voiceStatus])

  const handleSuggestion = useCallback((text: string) => {
    setDraft(text)
    setActionError(null)
    hapticSend()
    requestAnimationFrame(() => {
      void sendUserMessage().catch(() => {
        setActionError('Could not send that message.')
      })
    })
  }, [sendUserMessage, setDraft])

  const handlePickImage = useCallback(() => {
    setActionError(null)
    hapticAttachment()

    void (async () => {
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsMultipleSelection: false,
        mediaTypes: ['images'],
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
        presentationStyle: ImagePicker.UIImagePickerPresentationStyle.FULL_SCREEN,
        quality: 0.85,
        shouldDownloadFromNetwork: true,
      })

      if (result.canceled) return

      const imageAssets = result.assets.filter((asset) => (
        asset.uri.trim() !== '' &&
        (asset.type === undefined ||
          asset.type === null ||
          asset.type === 'image' ||
          asset.type === 'livePhoto' ||
          asset.mimeType?.startsWith('image/') === true)
      ))

      if (imageAssets.length === 0) {
        setActionError('Choose an image file to attach.')
        return
      }

      const imageParts = await Promise.all(
        imageAssets.map((asset) => assertReadableLlamaImage(imagePartFromLibraryAsset(asset))),
      )
      imageParts.forEach(stageAttachment)
    })().catch(() => {
      setActionError('Could not attach that image.')
    })
  }, [stageAttachment])

  const handlePickFile = useCallback(() => {
    setActionError(null)
    hapticAttachment()

    void (async () => {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: true,
        type: [
          'image/*',
          'text/*',
          'application/json',
          'application/xml',
          'application/yaml',
          'application/x-yaml',
        ],
      })

      if (result.canceled) return

      const failures: string[] = []
      for (const asset of result.assets) {
        try {
          const imagePart = imagePartFromDocumentAsset(asset)
          if (asset.mimeType?.startsWith('image/') === true || isSupportedLlamaImage(imagePart)) {
            stageAttachment(await assertReadableLlamaImage(imagePart))
            continue
          }

          stageAttachment(await textPartFromDocument(asset))
        } catch (error) {
          failures.push(error instanceof Error ? error.message : String(error))
        }
      }

      if (failures.length > 0) {
        setActionError(failures[0] ?? 'Could not attach that file.')
      }
    })().catch(() => {
      setActionError('Could not attach that file.')
    })
  }, [stageAttachment])

  const handleRemoveStagedAttachment = useCallback((index: number) => {
    setActionError(null)
    removeStagedAttachment(index)
  }, [removeStagedAttachment])

  const handleCancel = useCallback(() => {
    setActionError(null)
    hapticButton()
    cancelGeneration()
  }, [cancelGeneration])

  const handleMic = useCallback(() => {
    if (!voiceCanPress) return

    hapticButton()
    setActionError(null)
    const action = voiceStatus === 'listening'
      ? stopRecording()
      : voiceStatus === 'speaking'
        ? cancelVoice()
      : voiceStatus === 'requesting-permission' || voiceStatus === 'connecting'
        ? cancelVoice()
        : startRecording()

    void action.catch(() => {
      setActionError('Voice did not start cleanly.')
    })
  }, [cancelVoice, startRecording, stopRecording, voiceCanPress, voiceStatus])

  const handleOpenMemories = useCallback(() => {
    hapticButton()
    router.push('/memories')
  }, [router])

  const handleNewThread = useCallback(() => {
    if (generationActive) return
    hapticButton()
    const start = (): void => {
      setActionError(null)
      startNewThread()
    }
    if (messages.length === 0) {
      start()
      return
    }
    Alert.alert(
      'Start new chat?',
      'This clears the visible thread. Stored memories stay in the brain.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'New chat', style: 'destructive', onPress: start },
      ],
    )
  }, [generationActive, messages.length, startNewThread])

  const handleRetryModel = useCallback(() => {
    setActionError(null)
    hapticButton()
    void loadModel(modelSize).catch(() => {
      setActionError('Could not load the local model.')
    })
  }, [loadModel, modelSize])

  const handleUseSmallerModel = useCallback(() => {
    setActionError(null)
    hapticButton()
    setModelSize('gemma-4-E2B')
    void loadModel('gemma-4-E2B').catch(() => {
      setActionError('Could not load Gemma 4 E2B.')
    })
  }, [loadModel, setModelSize])

  const renderMessage = useCallback(
    ({ item }: ListRenderItemInfo<Message>) => <MessageBubble message={item} />,
    [],
  )

  const renderEmptyState = useCallback(
    () => <EmptyState onSuggestion={handleSuggestion} />,
    [handleSuggestion],
  )

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.root, { paddingTop: insets.top + 14 }]}
    >
      <View style={styles.header}>
        <View style={styles.titleGroup}>
          <Text style={styles.eyebrow}>Private phone brain</Text>
          <Text style={styles.title}>Jeff</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityLabel="New chat"
            accessibilityRole="button"
            accessibilityState={{ disabled: generationActive }}
            disabled={generationActive}
            onPress={handleNewThread}
            style={({ pressed }) => [
              styles.headerIconButton,
              generationActive ? styles.disabledHeaderButton : null,
              pressed ? styles.pressed : null,
            ]}
          >
            <Text style={styles.headerIconText}>{'✨'}</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Memories"
            accessibilityRole="button"
            onPress={handleOpenMemories}
            style={({ pressed }) => [styles.headerIconButton, pressed ? styles.pressed : null]}
          >
            <Text style={styles.headerIconText}>{'\u{1F9E0}'}</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Settings"
            accessibilityRole="button"
            onPress={() => { hapticButton(); router.push('/settings') }}
            style={({ pressed }) => [styles.headerIconButton, pressed ? styles.pressed : null]}
          >
            <Text style={styles.headerIconText}>{'⚙️'}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.statusPill}>
        <View style={[styles.statusDot, { backgroundColor: statusDotColour }]} />
        <Text style={styles.statusPillLabel} numberOfLines={1}>{statusPillLabel}</Text>
        {(modelStatus === 'checking' ||
          modelStatus === 'downloading' ||
          modelStatus === 'verifying' ||
          modelStatus === 'loaded' ||
          modelStatus === 'initialised') ? (
          <ActivityIndicator color={colors.accent.teal} size="small" />
        ) : null}
      </View>
      {modelStatus === 'error' ? (
        <View style={styles.statusErrorActions}>
          <Pressable
            accessibilityRole="button"
            onPress={handleRetryModel}
            style={({ pressed }) => [styles.statusActionButton, pressed ? styles.pressed : null]}
          >
            <Text style={styles.statusActionText}>Retry</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={handleUseSmallerModel}
            style={({ pressed }) => [
              styles.statusActionButton,
              styles.secondaryStatusActionButton,
              pressed ? styles.pressed : null,
            ]}
          >
            <Text style={styles.secondaryStatusActionText}>Use E2B</Text>
          </Pressable>
        </View>
      ) : null}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        ListEmptyComponent={renderEmptyState}
        onContentSizeChange={scrollToEnd}
        onLayout={scrollToEnd}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.messagesContent,
          messages.length === 0 ? styles.messagesContentEmpty : null,
        ]}
      />

      <View style={[styles.composerWrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        {actionError === null ? null : <Text style={styles.errorText}>{'⚠️'} {actionError}</Text>}
        {showVoiceTray ? (
          <View style={styles.voiceTray}>
            <View style={styles.voiceTrayHeader}>
              <Text style={styles.voiceTrayLabel}>{VOICE_STATUS_LABELS[voiceStatus]}</Text>
              {voiceStatus === 'listening' || voiceStatus === 'speaking' ? (
                <Text style={styles.voiceTrayMeta}>{voiceStatus === 'speaking' ? 'Gradium TTS' : 'Gradium STT'}</Text>
              ) : null}
            </View>
            {voiceTranscript === '' ? null : <Text style={styles.voiceTranscript}>{voiceTranscript}</Text>}
            {voiceError === null ? null : <Text style={styles.voiceError}>{voiceError}</Text>}
          </View>
        ) : null}
        <StagedAttachmentTray
          attachments={stagedAttachments}
          onClear={clearStaged}
          onRemove={handleRemoveStagedAttachment}
        />
        <GlassSurface effect="regular" style={styles.composer} tintColor="rgba(243, 239, 236, 0.74)">
          <TextInput
            multiline
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={handleSend}
            placeholder="Message Jeff"
            placeholderTextColor={colors.text.muted}
            returnKeyType="send"
            submitBehavior="submit"
            style={styles.input}
            textAlignVertical="top"
          />
          <View style={styles.composerActions}>
            <View style={styles.attachmentActions}>
              <Pressable
                accessibilityLabel="Attach photo"
                accessibilityRole="button"
                onPress={handlePickImage}
                style={({ pressed }) => [styles.attachmentButton, pressed ? styles.pressed : null]}
              >
                <Text style={styles.attachmentButtonText}>{'\u{1F5BC}️'}</Text>
              </Pressable>
              <Pressable
                accessibilityLabel="Attach file"
                accessibilityRole="button"
                onPress={handlePickFile}
                style={({ pressed }) => [styles.attachmentButton, pressed ? styles.pressed : null]}
              >
                <Text style={styles.attachmentButtonText}>{'\u{1F4CE}'}</Text>
              </Pressable>
              <Pressable
                accessibilityLabel={voiceStatus === 'listening' ? 'End recording' : voiceStatus === 'speaking' ? 'Stop speaking' : 'Start voice'}
                accessibilityRole="button"
                accessibilityState={{ disabled: !voiceCanPress, selected: voiceBusy }}
                disabled={!voiceCanPress}
                onPress={handleMic}
                style={({ pressed }) => [
                  styles.attachmentButton,
                  voiceBusy ? styles.voiceActiveButton : null,
                  !voiceCanPress ? styles.disabledAttachmentButton : null,
                  pressed ? styles.pressed : null,
                ]}
              >
                <Text style={[
                  styles.attachmentButtonText,
                  voiceBusy ? styles.voiceActiveButtonText : null,
                  !voiceCanPress ? styles.disabledAttachmentButtonText : null,
                ]}>
                  {voiceStatus === 'listening'
                    ? '⏹️'
                    : voiceStatus === 'speaking'
                      ? '⏹️'
                    : voiceStatus === 'connecting' || voiceStatus === 'requesting-permission'
                      ? '✖️'
                      : '\u{1F399}️'}
                </Text>
              </Pressable>
            </View>
            {generationActive ? (
              <Pressable
                accessibilityRole="button"
                onPress={handleCancel}
                style={({ pressed }) => [styles.cancelButton, pressed ? styles.pressed : null]}
              >
                <Text style={styles.cancelButtonText}>{'⏹️'}</Text>
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !canSend }}
                disabled={!canSend}
                onPress={handleSend}
                style={({ pressed }) => [
                  styles.sendButton,
                  !canSend ? styles.disabledSendButton : null,
                  pressed ? styles.pressed : null,
                ]}
              >
                <Text style={[styles.sendButtonText, !canSend ? styles.disabledSendButtonText : null]}>{'⬆️'}</Text>
              </Pressable>
            )}
          </View>
        </GlassSurface>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg.root,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  titleGroup: {
    flex: 1,
    paddingRight: 12,
  },
  eyebrow: {
    ...typography.eyebrow,
    color: colors.text.secondary,
  },
  title: {
    ...typography.display,
    color: colors.text.primary,
    marginTop: 2,
  },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  headerIconButton: {
    alignItems: 'center',
    backgroundColor: colors.button.ghost.bg,
    borderRadius: radius.pill,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  headerIconText: {
    fontSize: 18,
  },
  disabledHeaderButton: {
    opacity: 0.52,
  },
  pressed: {
    opacity: 0.72,
  },
  glassSurface: {
    backgroundColor: colors.bg.card,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  glassSurfaceNative: {
    backgroundColor: 'transparent',
  },
  glassSurfaceFallback: {
    backgroundColor: colors.bg.glass,
  },
  statusPill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.bg.card,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing(2),
    marginHorizontal: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    ...shadows[1],
  },
  statusDot: {
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  statusPillLabel: {
    ...typography.caption,
    color: colors.text.primary,
    flexShrink: 1,
  },
  statusErrorActions: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 20,
    marginTop: 8,
  },
  statusActionButton: {
    alignItems: 'center',
    backgroundColor: colors.accent.teal,
    borderRadius: radius.sm,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 16,
  },
  secondaryStatusActionButton: {
    backgroundColor: colors.bg.secondary,
  },
  statusActionText: {
    color: colors.text.onAccent,
    ...typography.bodyBold,
  },
  secondaryStatusActionText: {
    color: colors.text.primary,
    ...typography.bodyBold,
  },
  providerBadge: {
    backgroundColor: colors.button.selected.bg,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  providerLabel: {
    color: colors.text.onAccentLight,
    ...typography.bodyBold,
  },
  providerDetail: {
    color: colors.text.secondary,
    ...typography.caption,
    marginTop: 3,
  },
  messagesContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 18,
  },
  messagesContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    alignSelf: 'center',
    maxWidth: 320,
    paddingVertical: 48,
  },
  emptyAvatar: {
    alignItems: 'center',
    backgroundColor: colors.accent.teal,
    borderRadius: 32,
    height: 64,
    justifyContent: 'center',
    marginBottom: spacing(4),
    width: 64,
  },
  emptyAvatarText: {
    color: colors.text.onAccent,
    fontSize: 28,
    fontWeight: '700',
  },
  emptyTitle: {
    ...typography.heading,
    color: colors.text.primary,
    textAlign: 'center',
  },
  emptyCopy: {
    ...typography.body,
    color: colors.text.secondary,
    marginTop: spacing(2),
    textAlign: 'center',
  },
  suggestionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing(2),
    justifyContent: 'center',
    marginTop: spacing(5),
  },
  suggestionChip: {
    backgroundColor: colors.button.secondary.bg,
    borderColor: colors.button.secondary.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  suggestionChipText: {
    ...typography.caption,
    color: colors.accent.teal,
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  messageRowUser: {
    justifyContent: 'flex-end',
  },
  messageRowAssistant: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    borderRadius: radius.lg,
    maxWidth: '86%',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  userBubble: {
    backgroundColor: colors.bubble.user.bg,
    borderBottomRightRadius: 6,
  },
  assistantBubble: {
    backgroundColor: colors.bubble.assistant.bg,
    borderBottomLeftRadius: 6,
  },
  toolBubble: {
    backgroundColor: colors.bubble.tool.bg,
    borderColor: colors.bubble.tool.border,
    borderWidth: 1,
  },
  systemBubble: {
    backgroundColor: colors.bubble.system.bg,
  },
  messageMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginBottom: 5,
  },
  messageMetaActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    gap: 8,
  },
  messageRoute: {
    color: colors.accent.warning,
    flexShrink: 1,
    ...typography.micro,
  },
  speechButton: {
    alignItems: 'center',
    backgroundColor: colors.button.ghost.bg,
    borderRadius: radius.sm,
    justifyContent: 'center',
    minHeight: 28,
    minWidth: 36,
    paddingHorizontal: 6,
  },
  speechButtonActive: {
    backgroundColor: colors.button.destructive.bg,
  },
  speechButtonDisabled: {
    opacity: 0.5,
  },
  speechButtonText: {
    fontSize: 14,
  },
  speechButtonTextActive: {
    fontSize: 14,
  },
  speechButtonTextDisabled: {
    opacity: 0.5,
  },
  messageText: {
    ...typography.body,
    color: colors.bubble.assistant.text,
  },
  toolCallStrip: {
    gap: 5,
    marginBottom: 8,
  },
  toolCallText: {
    alignSelf: 'flex-start',
    backgroundColor: '#E6F9F5',
    borderRadius: radius.xs,
    color: colors.text.onAccentLight,
    ...typography.micro,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  messageImageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  messageImage: {
    backgroundColor: colors.bg.secondary,
    borderRadius: radius.sm,
    height: 124,
    width: 124,
  },
  userMessageText: {
    color: colors.bubble.user.text,
  },
  routeDetail: {
    color: colors.text.secondary,
    ...typography.micro,
    marginTop: 7,
  },
  thinkingPanel: {
    backgroundColor: colors.bg.secondary,
    borderRadius: radius.sm,
    marginBottom: 8,
    overflow: 'hidden',
  },
  thinkingToggle: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 44,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  thinkingToggleStatic: {
    opacity: 0.8,
  },
  thinkingStatus: {
    color: colors.text.secondary,
    flex: 1,
    ...typography.caption,
    fontWeight: '600',
  },
  thinkingToggleText: {
    color: colors.accent.teal,
    fontSize: 12,
    fontWeight: '600',
  },
  thinkingText: {
    borderColor: colors.divider,
    borderTopWidth: 1,
    color: colors.text.secondary,
    ...typography.caption,
    lineHeight: 19,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  composerWrap: {
    borderColor: colors.divider,
    borderTopWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  errorText: {
    color: colors.accent.error,
    ...typography.caption,
    marginBottom: 8,
    paddingHorizontal: 6,
  },
  stagedTray: {
    backgroundColor: colors.bg.card,
    borderRadius: radius.md,
    marginBottom: 8,
    padding: 8,
    ...shadows[1],
  },
  stagedTrayHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  stagedTrayTitle: {
    color: colors.text.secondary,
    ...typography.caption,
    fontWeight: '600',
  },
  clearStagedButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  clearStagedText: {
    fontSize: 16,
  },
  stagedScroller: {
    marginHorizontal: -2,
  },
  stagedAttachment: {
    backgroundColor: colors.bg.secondary,
    borderRadius: radius.sm,
    marginHorizontal: 2,
    marginRight: 8,
    minHeight: 76,
    overflow: 'hidden',
    position: 'relative',
    width: 108,
  },
  stagedImage: {
    backgroundColor: colors.bg.grouped,
    height: 50,
    width: '100%',
  },
  stagedFilePreview: {
    alignItems: 'center',
    backgroundColor: colors.bg.secondary,
    height: 50,
    justifyContent: 'center',
    width: '100%',
  },
  stagedFilePreviewText: {
    color: colors.text.secondary,
    ...typography.caption,
    fontWeight: '600',
  },
  stagedAttachmentLabel: {
    color: colors.text.primary,
    ...typography.caption,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  stagedRemoveButton: {
    alignItems: 'center',
    backgroundColor: colors.bg.card,
    borderRadius: radius.sm,
    height: 24,
    justifyContent: 'center',
    position: 'absolute',
    right: 4,
    top: 4,
    width: 24,
    ...shadows[1],
  },
  stagedRemoveText: {
    color: colors.text.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  composer: {
    gap: 8,
    minHeight: 56,
    padding: 8,
    ...shadows[2],
  },
  composerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  attachmentActions: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  attachmentButton: {
    alignItems: 'center',
    backgroundColor: colors.button.ghost.bg,
    borderRadius: radius.sm,
    height: 44,
    justifyContent: 'center',
    minWidth: 44,
    paddingHorizontal: 10,
  },
  attachmentButtonText: {
    fontSize: 18,
  },
  disabledAttachmentButton: {
    backgroundColor: colors.button.disabled.bg,
    opacity: 0.58,
  },
  disabledAttachmentButtonText: {
    opacity: 0.5,
  },
  voiceActiveButton: {
    backgroundColor: colors.button.selected.bg,
  },
  voiceActiveButtonText: {
    fontSize: 18,
  },
  voiceTray: {
    backgroundColor: colors.bg.card,
    borderRadius: radius.md,
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    ...shadows[1],
  },
  voiceTrayHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  voiceTrayLabel: {
    color: colors.text.primary,
    ...typography.bodyBold,
  },
  voiceTrayMeta: {
    color: colors.accent.teal,
    ...typography.caption,
    fontWeight: '600',
  },
  voiceTranscript: {
    color: colors.text.primary,
    ...typography.body,
  },
  voiceError: {
    color: colors.accent.error,
    ...typography.caption,
    lineHeight: 18,
  },
  input: {
    color: colors.text.primary,
    fontSize: 16,
    lineHeight: 21,
    maxHeight: 104,
    minHeight: 44,
    paddingBottom: 8,
    paddingHorizontal: 8,
    paddingTop: Platform.OS === 'ios' ? 10 : 7,
  },
  sendButton: {
    alignItems: 'center',
    backgroundColor: colors.accent.teal,
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
    flexShrink: 0,
  },
  sendButtonText: {
    fontSize: 18,
  },
  disabledSendButton: {
    backgroundColor: colors.button.disabled.bg,
  },
  disabledSendButtonText: {
    opacity: 0.5,
  },
  cancelButton: {
    alignItems: 'center',
    backgroundColor: colors.accent.coral,
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
    flexShrink: 0,
  },
  cancelButtonText: {
    fontSize: 18,
  },
})
