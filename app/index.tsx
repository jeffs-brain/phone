import { useCallback, useEffect, useState } from 'react'
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import { useRouter } from 'expo-router'
import { Alert, KeyboardAvoidingView, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { ChatComposer } from '../components/chat/chat-composer'
import { ChatHeader } from '../components/chat/chat-header'
import { ChatMessageList } from '../components/chat/chat-message-list'
import { ModelStatusBanner } from '../components/chat/model-status-banner'
import { styles } from '../components/chat/styles'
import {
  filePartFromDocument,
  imagePartFromDocumentAsset,
  imagePartFromLibraryAsset,
  isSupportedLlamaImage,
  normaliseImageForLlama,
} from '../lib/chat/attachment-helpers'
import {
  GENERATION_STATUS_LABELS,
  MODEL_STATUS_LABELS,
  STATUS_DOT_COLOURS,
  VOICE_BUSY_STATUSES,
  isGenerationActive,
} from '../lib/chat/status-helpers'
import { hapticAttachment, hapticButton, hapticSend } from '../lib/haptics'
import { useStore } from '../store'

export default function Chat() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
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
  const downloadBytes = useStore((s) => s.downloadBytes)
  const cancelGeneration = useStore((s) => s.cancelGeneration)
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
  const statusDotColour = STATUS_DOT_COLOURS[modelStatus]
  const statusPillLabel = generationActive
    ? `${MODEL_STATUS_LABELS[modelStatus]} \u00B7 ${GENERATION_STATUS_LABELS[generationStatus].toLowerCase()}`
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
      if (stagedAttachments.some((part) => part.type === 'image')) {
        setActionError('Use one image per message for the local vision model.')
        return
      }

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
        imageAssets.slice(0, 1).map((asset) => normaliseImageForLlama(imagePartFromLibraryAsset(asset))),
      )
      imageParts.forEach(stageAttachment)
    })().catch(() => {
      setActionError('Could not attach that image.')
    })
  }, [stageAttachment, stagedAttachments])

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
      let hasImageAttachment = stagedAttachments.some((part) => part.type === 'image')
      for (const asset of result.assets) {
        try {
          const imagePart = imagePartFromDocumentAsset(asset)
          if (asset.mimeType?.startsWith('image/') === true || isSupportedLlamaImage(imagePart)) {
            if (hasImageAttachment) {
              failures.push('Use one image per message for the local vision model.')
              continue
            }
            stageAttachment(await normaliseImageForLlama(imagePart))
            hasImageAttachment = true
            continue
          }

          stageAttachment(await filePartFromDocument(asset))
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
  }, [stageAttachment, stagedAttachments])

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

  const handleOpenSettings = useCallback(() => {
    hapticButton()
    router.push('/settings')
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

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.root, { paddingTop: insets.top + 14 }]}
    >
      <ChatHeader
        generationActive={generationActive}
        onNewThread={handleNewThread}
        onOpenMemories={handleOpenMemories}
        onOpenSettings={handleOpenSettings}
      />

      <ModelStatusBanner
        downloadBytes={downloadBytes}
        modelStatus={modelStatus}
        onRetryModel={handleRetryModel}
        onUseSmallerModel={handleUseSmallerModel}
        statusDotColour={statusDotColour}
        statusPillLabel={statusPillLabel}
      />

      <ChatMessageList
        messages={messages}
        onSuggestion={handleSuggestion}
      />

      <ChatComposer
        actionError={actionError}
        bottomInset={insets.bottom}
        canSend={canSend}
        draft={draft}
        generationActive={generationActive}
        onCancel={handleCancel}
        onChangeDraft={setDraft}
        onClearStaged={clearStaged}
        onMic={handleMic}
        onPickFile={handlePickFile}
        onPickImage={handlePickImage}
        onRemoveStagedAttachment={handleRemoveStagedAttachment}
        onSend={handleSend}
        showVoiceTray={showVoiceTray}
        stagedAttachments={stagedAttachments}
        voiceBusy={voiceBusy}
        voiceCanPress={voiceCanPress}
        voiceError={voiceError}
        voiceStatus={voiceStatus}
        voiceTranscript={voiceTranscript}
      />
    </KeyboardAvoidingView>
  )
}
