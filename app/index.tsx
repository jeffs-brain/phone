import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
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
  routing: 'Routing',
  'preparing-vision': 'Preparing vision',
  'loading-first-token': 'Loading first token',
  thinking: 'Thinking',
  'using-tools': 'Using tools',
  streaming: 'Streaming',
  done: 'Done',
  error: 'Generation error',
}

const VOICE_STATUS_LABELS: Record<VoiceStatus, string> = {
  idle: 'Voice ready',
  'requesting-permission': 'Requesting mic',
  connecting: 'Connecting to Gradium',
  listening: 'Listening',
  'ending-turn': 'Ending turn',
  transcribing: 'Transcribing',
  sending: 'Sending to Jeff',
  speaking: 'Speaking',
  error: 'Voice error',
}

const VOICE_BUSY_STATUSES: readonly VoiceStatus[] = [
  'requesting-permission',
  'connecting',
  'listening',
  'ending-turn',
  'transcribing',
  'sending',
  'speaking',
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

function EmptyState() {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>Jeff is ready for a chat.</Text>
      <Text style={styles.emptyCopy}>Ask something, test routing, or load a local model from settings first.</Text>
    </View>
  )
}

function GlassSurface({
  children,
  style,
  effect = 'regular',
  tintColor = 'rgba(16, 20, 29, 0.72)',
}: GlassSurfaceProps) {
  const surfaceStyle = [
    styles.glassSurface,
    isLiquidGlassSupported ? styles.glassSurfaceNative : styles.glassSurfaceFallback,
    style,
  ]

  if (isLiquidGlassSupported) {
    return (
      <LiquidGlassView
        colorScheme="dark"
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
          <Text style={styles.thinkingToggleText}>{expanded ? 'Hide' : 'Show'}</Text>
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
          onPress={onClear}
          style={({ pressed }) => [styles.clearStagedButton, pressed ? styles.pressed : null]}
        >
          <Text style={styles.clearStagedText}>Clear</Text>
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
  const text = getMessageText(message)
  const thinking = isAssistant ? getThinkingDetail(message.thinking) : null
  const images = getImageParts(message)
  const hasAnswer = text.trim() !== ''
  const displayText = hasAnswer ? text : 'Thinking...'
  const showAnswerText = hasAnswer || (isAssistant && thinking === null && images.length === 0)

  return (
    <View style={[styles.messageRow, isUser ? styles.messageRowUser : styles.messageRowAssistant]}>
      <View style={[
        styles.messageBubble,
        isUser ? styles.userBubble : styles.assistantBubble,
        message.role === 'tool' ? styles.toolBubble : null,
        message.role === 'system' ? styles.systemBubble : null,
      ]}>
        <View style={styles.messageMetaRow}>
          <Text style={[styles.messageRole, isUser ? styles.userMessageRole : null]}>
            {getRoleLabel(message.role)}
          </Text>
          {message.routeDecision === undefined ? null : (
            <Text style={styles.messageRoute}>{PROVIDER_LABELS[message.routeDecision.provider]}</Text>
          )}
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

  const scrollToEnd = useCallback(() => {
    if (messages.length === 0) return
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }))
  }, [messages.length])

  const handleSend = useCallback(() => {
    if (!canSend) return
    setActionError(null)
    void sendUserMessage().catch(() => {
      setActionError('Could not send that message.')
    })
  }, [canSend, sendUserMessage])

  const handlePickImage = useCallback(() => {
    setActionError(null)

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
    cancelGeneration()
  }, [cancelGeneration])

  const handleMic = useCallback(() => {
    if (!voiceCanPress) return

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
    router.push('/memories')
  }, [router])

  const handleNewThread = useCallback(() => {
    if (generationActive) return
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
    void loadModel(modelSize).catch(() => {
      setActionError('Could not load the local model.')
    })
  }, [loadModel, modelSize])

  const handleUseSmallerModel = useCallback(() => {
    setActionError(null)
    setModelSize('gemma-4-E2B')
    void loadModel('gemma-4-E2B').catch(() => {
      setActionError('Could not load Gemma 4 E2B.')
    })
  }, [loadModel, setModelSize])

  const renderMessage = useCallback(
    ({ item }: ListRenderItemInfo<Message>) => <MessageBubble message={item} />,
    [],
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
            accessibilityRole="button"
            accessibilityState={{ disabled: generationActive }}
            disabled={generationActive}
            onPress={handleNewThread}
            style={({ pressed }) => [
              styles.headerButton,
              generationActive ? styles.disabledHeaderButton : null,
              pressed ? styles.pressed : null,
            ]}
          >
            <Text style={[styles.headerButtonText, generationActive ? styles.disabledHeaderButtonText : null]}>
              New
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={handleOpenMemories}
            style={({ pressed }) => [styles.headerButton, styles.brainButton, pressed ? styles.pressed : null]}
          >
            <Text style={[styles.headerButtonText, styles.brainButtonText]}>Brain</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/settings')}
            style={({ pressed }) => [styles.headerButton, pressed ? styles.pressed : null]}
          >
            <Text style={styles.headerButtonText}>Settings</Text>
          </Pressable>
        </View>
      </View>

      <GlassSurface effect="clear" style={styles.statusPanel} tintColor="rgba(16, 20, 29, 0.64)">
        <ProviderBadge decision={lastDecision} modelSize={modelId ?? modelSize} />
        <View style={styles.statusDivider} />
        <View style={styles.modelStatus}>
          <View style={styles.statusHeadingRow}>
            <Text style={styles.statusLabel}>{MODEL_STATUS_LABELS[modelStatus]}</Text>
            {modelStatus === 'checking' ||
            modelStatus === 'downloading' ||
            modelStatus === 'verifying' ||
            modelStatus === 'loaded' ||
            modelStatus === 'initialised' ? (
              <ActivityIndicator color="#8be9d4" size="small" />
            ) : null}
          </View>
          <Text style={styles.statusDetail}>{modelDetail}</Text>
          <Text style={styles.generationStatus}>
            {generationActive ? 'Now ' : ''}{GENERATION_STATUS_LABELS[generationStatus].toLowerCase()}
          </Text>
          {modelStatus === 'error' ? (
            <View style={styles.statusActions}>
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
        </View>
      </GlassSurface>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        ListEmptyComponent={EmptyState}
        onContentSizeChange={scrollToEnd}
        onLayout={scrollToEnd}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.messagesContent,
          messages.length === 0 ? styles.messagesContentEmpty : null,
        ]}
      />

      <View style={[styles.composerWrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        {actionError === null ? null : <Text style={styles.errorText}>{actionError}</Text>}
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
        <GlassSurface effect="regular" style={styles.composer} tintColor="rgba(16, 20, 29, 0.74)">
          <TextInput
            multiline
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={handleSend}
            placeholder="Message Jeff"
            placeholderTextColor="#737987"
            returnKeyType="send"
            submitBehavior="submit"
            style={styles.input}
            textAlignVertical="top"
          />
          <View style={styles.composerActions}>
            <View style={styles.attachmentActions}>
              <Pressable
                accessibilityRole="button"
                onPress={handlePickImage}
                style={({ pressed }) => [styles.attachmentButton, pressed ? styles.pressed : null]}
              >
                <Text style={styles.attachmentButtonText}>Photo</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={handlePickFile}
                style={({ pressed }) => [styles.attachmentButton, pressed ? styles.pressed : null]}
              >
                <Text style={styles.attachmentButtonText}>File</Text>
              </Pressable>
              <Pressable
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
                    ? 'End'
                    : voiceStatus === 'speaking'
                      ? 'Stop'
                    : voiceStatus === 'connecting' || voiceStatus === 'requesting-permission'
                      ? 'Cancel'
                      : 'Mic'}
                </Text>
              </Pressable>
            </View>
            {generationActive ? (
              <Pressable
                accessibilityRole="button"
                onPress={handleCancel}
                style={({ pressed }) => [styles.cancelButton, pressed ? styles.pressed : null]}
              >
                <Text style={styles.cancelButtonText}>Stop</Text>
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
                <Text style={[styles.sendButtonText, !canSend ? styles.disabledSendButtonText : null]}>Send</Text>
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
    backgroundColor: '#080a0f',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 14,
  },
  titleGroup: {
    flex: 1,
    paddingRight: 12,
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
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: 0,
    marginTop: 2,
  },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    backgroundColor: '#171b25',
    borderColor: '#2d3444',
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  headerButtonText: {
    color: '#f4f7fb',
    fontSize: 13,
    fontWeight: '800',
  },
  brainButton: {
    backgroundColor: '#16231f',
    borderColor: '#3f8f7d',
  },
  brainButtonText: {
    color: '#c8f7e8',
  },
  disabledHeaderButton: {
    opacity: 0.52,
  },
  disabledHeaderButtonText: {
    color: '#9aa3b5',
  },
  pressed: {
    opacity: 0.72,
  },
  glassSurface: {
    backgroundColor: '#10141d',
    borderColor: '#252b3a',
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  glassSurfaceNative: {
    backgroundColor: 'transparent',
  },
  glassSurfaceFallback: {
    backgroundColor: '#10141d',
  },
  statusPanel: {
    marginHorizontal: 18,
    padding: 12,
  },
  providerBadge: {
    backgroundColor: '#16231f',
    borderColor: '#2e5a4f',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  providerLabel: {
    color: '#c8f7e8',
    fontSize: 14,
    fontWeight: '800',
  },
  providerDetail: {
    color: '#8fcbb9',
    fontSize: 12,
    marginTop: 3,
  },
  statusDivider: {
    backgroundColor: '#252b3a',
    height: 1,
    marginVertical: 12,
  },
  modelStatus: {
    gap: 4,
  },
  statusHeadingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statusLabel: {
    color: '#f4f7fb',
    fontSize: 15,
    fontWeight: '800',
  },
  statusDetail: {
    color: '#a8b0c2',
    fontSize: 13,
    lineHeight: 18,
  },
  generationStatus: {
    color: '#d6a85a',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  statusActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  statusActionButton: {
    alignItems: 'center',
    backgroundColor: '#8be9d4',
    borderColor: '#a7f5e4',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: 12,
  },
  secondaryStatusActionButton: {
    backgroundColor: '#171b25',
    borderColor: '#344052',
  },
  statusActionText: {
    color: '#07110f',
    fontSize: 13,
    fontWeight: '900',
  },
  secondaryStatusActionText: {
    color: '#d8deea',
    fontSize: 13,
    fontWeight: '900',
  },
  messagesContent: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 18,
  },
  messagesContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyState: {
    alignSelf: 'center',
    maxWidth: 320,
    paddingVertical: 48,
  },
  emptyTitle: {
    color: '#f4f7fb',
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 26,
    textAlign: 'center',
  },
  emptyCopy: {
    color: '#9aa3b5',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    textAlign: 'center',
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
    borderRadius: 8,
    maxWidth: '86%',
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  userBubble: {
    backgroundColor: '#245c52',
  },
  assistantBubble: {
    backgroundColor: '#151a24',
    borderColor: '#262e3f',
    borderWidth: 1,
  },
  toolBubble: {
    backgroundColor: '#211b13',
    borderColor: '#5a4525',
  },
  systemBubble: {
    backgroundColor: '#1c1f29',
    borderColor: '#34394a',
  },
  messageMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 5,
  },
  messageRole: {
    color: '#9ba7bd',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  userMessageRole: {
    color: '#bbefe2',
  },
  messageRoute: {
    color: '#d0a968',
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '700',
  },
  messageText: {
    color: '#eef2f8',
    fontSize: 15,
    lineHeight: 21,
  },
  toolCallStrip: {
    gap: 5,
    marginBottom: 8,
  },
  toolCallText: {
    alignSelf: 'flex-start',
    backgroundColor: '#202838',
    borderColor: '#344052',
    borderRadius: 8,
    borderWidth: 1,
    color: '#9ff0dd',
    fontSize: 11,
    fontWeight: '800',
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
    backgroundColor: '#0a0d13',
    borderRadius: 8,
    height: 124,
    width: 124,
  },
  userMessageText: {
    color: '#f6fffb',
  },
  routeDetail: {
    color: '#7f8aa0',
    fontSize: 11,
    marginTop: 7,
  },
  thinkingPanel: {
    backgroundColor: '#101722',
    borderColor: '#283345',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
    overflow: 'hidden',
  },
  thinkingToggle: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 34,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  thinkingToggleStatic: {
    opacity: 0.8,
  },
  thinkingStatus: {
    color: '#b9c5d8',
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
  },
  thinkingToggleText: {
    color: '#8be9d4',
    fontSize: 12,
    fontWeight: '800',
  },
  thinkingText: {
    borderColor: '#263145',
    borderTopWidth: 1,
    color: '#aab5c8',
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  composerWrap: {
    borderColor: '#1c2230',
    borderTopWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  errorText: {
    color: '#ff9f9f',
    fontSize: 13,
    marginBottom: 8,
    paddingHorizontal: 6,
  },
  stagedTray: {
    backgroundColor: '#10141d',
    borderColor: '#283044',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
    padding: 8,
  },
  stagedTrayHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  stagedTrayTitle: {
    color: '#b9c5d8',
    fontSize: 12,
    fontWeight: '800',
  },
  clearStagedButton: {
    minHeight: 28,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  clearStagedText: {
    color: '#8be9d4',
    fontSize: 12,
    fontWeight: '800',
  },
  stagedScroller: {
    marginHorizontal: -2,
  },
  stagedAttachment: {
    backgroundColor: '#161b26',
    borderColor: '#30384a',
    borderRadius: 8,
    borderWidth: 1,
    marginHorizontal: 2,
    marginRight: 8,
    minHeight: 76,
    overflow: 'hidden',
    position: 'relative',
    width: 108,
  },
  stagedImage: {
    backgroundColor: '#0a0d13',
    height: 50,
    width: '100%',
  },
  stagedFilePreview: {
    alignItems: 'center',
    backgroundColor: '#202737',
    height: 50,
    justifyContent: 'center',
    width: '100%',
  },
  stagedFilePreviewText: {
    color: '#b9c5d8',
    fontSize: 12,
    fontWeight: '900',
  },
  stagedAttachmentLabel: {
    color: '#dce3ef',
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  stagedRemoveButton: {
    alignItems: 'center',
    backgroundColor: '#10141d',
    borderColor: '#384255',
    borderRadius: 8,
    borderWidth: 1,
    height: 24,
    justifyContent: 'center',
    position: 'absolute',
    right: 4,
    top: 4,
    width: 24,
  },
  stagedRemoveText: {
    color: '#f3f6fb',
    fontSize: 12,
    fontWeight: '900',
  },
  composer: {
    gap: 8,
    minHeight: 56,
    padding: 8,
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
    backgroundColor: '#171d29',
    borderColor: '#334053',
    borderRadius: 8,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    minWidth: 56,
    paddingHorizontal: 10,
  },
  attachmentButtonText: {
    color: '#dce3ef',
    fontSize: 13,
    fontWeight: '900',
  },
  placeholderAttachmentButton: {
    opacity: 0.45,
  },
  placeholderAttachmentButtonText: {
    color: '#9aa4b6',
    fontSize: 13,
    fontWeight: '900',
  },
  disabledAttachmentButton: {
    backgroundColor: '#202737',
    borderColor: '#344052',
    opacity: 0.58,
  },
  disabledAttachmentButtonText: {
    color: '#8d96aa',
  },
  voiceActiveButton: {
    backgroundColor: '#173a33',
    borderColor: '#3f947f',
  },
  voiceActiveButtonText: {
    color: '#bdf7e8',
  },
  voiceTray: {
    backgroundColor: '#111722',
    borderColor: '#293447',
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  voiceTrayHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  voiceTrayLabel: {
    color: '#dce3ef',
    fontSize: 13,
    fontWeight: '900',
  },
  voiceTrayMeta: {
    color: '#8bcdbf',
    fontSize: 12,
    fontWeight: '800',
  },
  voiceTranscript: {
    color: '#f4f7fb',
    fontSize: 15,
    lineHeight: 20,
  },
  voiceError: {
    color: '#ff9fb0',
    fontSize: 13,
    lineHeight: 18,
  },
  input: {
    color: '#f4f7fb',
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
    backgroundColor: '#8be9d4',
    borderRadius: 8,
    borderColor: '#a7f5e4',
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    minWidth: 72,
    paddingHorizontal: 15,
    flexShrink: 0,
  },
  sendButtonText: {
    color: '#07110f',
    fontSize: 14,
    fontWeight: '900',
  },
  disabledSendButton: {
    backgroundColor: '#202737',
    borderColor: '#344052',
  },
  disabledSendButtonText: {
    color: '#8d96aa',
  },
  cancelButton: {
    alignItems: 'center',
    backgroundColor: '#3a1f27',
    borderColor: '#8a3e4f',
    borderRadius: 8,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    minWidth: 58,
    paddingHorizontal: 13,
    flexShrink: 0,
  },
  cancelButtonText: {
    color: '#ffd8de',
    fontSize: 14,
    fontWeight: '900',
  },
})
