import { useCallback, useMemo, useRef, useState } from 'react'
import { useRouter } from 'expo-router'
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ListRenderItemInfo,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useStore } from '../store'
import type { ModelStatus } from '../store/slices/inference'
import type { ContentPart, GenerationStatus, Message, ProviderId, RouteDecision } from '../store/types'

const ACTIVE_GENERATION_STATUSES: readonly GenerationStatus[] = [
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
  'loading-first-token': 'Loading first token',
  thinking: 'Thinking',
  'using-tools': 'Using tools',
  streaming: 'Streaming',
  done: 'Done',
  error: 'Generation error',
}

const MODEL_LABELS = {
  'gemma-4-E2B': 'Gemma 4 E2B',
  'gemma-4-E4B': 'Gemma 4 E4B',
} as const

const formatContentPart = (part: ContentPart): string => {
  if (part.type === 'text') return part.text
  if (part.type === 'image') return 'Image attached'
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
  if (normalised.includes('projector') || normalised.includes('initialise')) {
    return 'Native model initialisation failed. Retry, or use Gemma 4 E2B for the simulator.'
  }
  return error
}

const isGenerationActive = (status: GenerationStatus): boolean => ACTIVE_GENERATION_STATUSES.includes(status)

const getMessageText = (message: Message): string => {
  if (message.streamingText !== undefined) return message.streamingText
  return message.parts.map(formatContentPart).filter((part) => part.trim() !== '').join('\n\n')
}

const getRoleLabel = (role: Message['role']): string => {
  if (role === 'user') return 'You'
  if (role === 'assistant') return 'Jeff'
  if (role === 'tool') return 'Tool'
  return 'System'
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

function ProviderBadge({ decision }: { decision: RouteDecision | null }) {
  const label = decision === null ? 'Provider pending' : PROVIDER_LABELS[decision.provider]
  const detail = decision === null
    ? 'Send a message to route'
    : `${decision.routed ? 'Smart route' : 'Manual'} · ${decision.tier} · ${Math.round(decision.confidence * 100)}%`

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

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'
  const isAssistant = message.role === 'assistant'
  const text = getMessageText(message)
  const displayText = text.trim() === '' && isAssistant ? 'Thinking...' : text

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
        <Text style={[styles.messageText, isUser ? styles.userMessageText : null]}>
          {displayText}
        </Text>
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
  const loadModel = useStore((s) => s.loadModel)
  const generationStatus = useStore((s) => s.generationStatus)
  const modelStatus = useStore((s) => s.modelStatus)
  const modelError = useStore((s) => s.modelError)
  const downloadBytes = useStore((s) => s.downloadBytes)
  const cancelGeneration = useStore((s) => s.cancelGeneration)
  const lastDecision = useStore((s) => s.lastDecision)
  const modelSize = useStore((s) => s.modelSize)
  const setModelSize = useStore((s) => s.setModelSize)

  const generationActive = isGenerationActive(generationStatus)
  const canSend = draft.trim().length > 0 && !generationActive
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

  const handleCancel = useCallback(() => {
    setActionError(null)
    cancelGeneration()
  }, [cancelGeneration])

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
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/settings')}
          style={({ pressed }) => [styles.settingsButton, pressed ? styles.pressed : null]}
        >
          <Text style={styles.settingsButtonText}>Settings</Text>
        </Pressable>
      </View>

      <View style={styles.statusPanel}>
        <ProviderBadge decision={lastDecision} />
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
      </View>

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
        <View style={styles.composer}>
          <Pressable
            accessibilityRole="button"
            disabled
            style={[styles.micButton, styles.disabledControl]}
          >
            <Text style={styles.micButtonText}>Mic</Text>
          </Pressable>
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
  settingsButton: {
    backgroundColor: '#171b25',
    borderColor: '#2d3444',
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  settingsButtonText: {
    color: '#f4f7fb',
    fontSize: 14,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.72,
  },
  statusPanel: {
    backgroundColor: '#10141d',
    borderColor: '#252b3a',
    borderRadius: 8,
    borderWidth: 1,
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
  userMessageText: {
    color: '#f6fffb',
  },
  routeDetail: {
    color: '#7f8aa0',
    fontSize: 11,
    marginTop: 7,
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
  composer: {
    alignItems: 'flex-end',
    backgroundColor: '#10141d',
    borderColor: '#283044',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 56,
    padding: 8,
  },
  micButton: {
    alignItems: 'center',
    borderColor: '#30384a',
    borderRadius: 8,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 50,
  },
  micButtonText: {
    color: '#7f8798',
    fontSize: 13,
    fontWeight: '800',
  },
  input: {
    color: '#f4f7fb',
    flex: 1,
    fontSize: 16,
    lineHeight: 21,
    maxHeight: 120,
    minHeight: 40,
    paddingHorizontal: 4,
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
  },
  cancelButtonText: {
    color: '#ffd8de',
    fontSize: 14,
    fontWeight: '900',
  },
  disabledControl: {
    opacity: 0.45,
  },
  disabledText: {
    color: '#51605e',
  },
})
