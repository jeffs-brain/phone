import { useCallback } from 'react'
import { Image, Pressable, Text, View } from 'react-native'

import {
  getFileParts,
  getImageParts,
  getMessageText,
  getThinkingDetail,
  toolCallDetail,
  toolCallLabel,
} from '../../lib/chat/message-helpers'
import { PROVIDER_LABELS } from '../../lib/chat/status-helpers'
import { hapticButton } from '../../lib/haptics'
import { useStore } from '../../store'
import type { Message } from '../../store/types'
import { ThinkingDisclosure } from './thinking-disclosure'
import { styles } from './styles'

export type MessageBubbleProps = {
  readonly message: Message
}

export function MessageBubble({ message }: MessageBubbleProps) {
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
  const files = getFileParts(message)
  const hasAnswer = text.trim() !== ''
  const displayText = hasAnswer ? text : 'Thinking...'
  const showAnswerText = hasAnswer || (isAssistant && thinking === null && images.length === 0 && files.length === 0)
  const isSpeakingThisMessage = voiceStatus === 'speaking' && ttsCurrent?.messageId === message.id
  const canSpeakMessage = isAssistant && voiceEnabled && hasAnswer && message.streamingText === undefined
  const speechDisabled = !canSpeakMessage || (voiceStatus !== 'idle' && !isSpeakingThisMessage)
  const showMetaRow = canSpeakMessage || message.routeDecision !== undefined

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
        {showMetaRow ? (
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
                    {isSpeakingThisMessage ? '\u23F9\uFE0F' : '\u{1F50A}'}
                  </Text>
                </Pressable>
              ) : null}
              {message.routeDecision === undefined ? null : (
                <Text style={styles.messageRoute}>{PROVIDER_LABELS[message.routeDecision.provider]}</Text>
              )}
            </View>
          </View>
        ) : null}
        {thinking === null ? null : <ThinkingDisclosure thinking={thinking} />}
        {message.toolCalls === undefined || message.toolCalls.length === 0 ? null : (
          <View style={styles.toolCallStrip}>
            {message.toolCalls.map((toolCall) => {
              const detail = toolCallDetail(toolCall)
              return (
                <View key={toolCall.id} style={styles.toolCallRow}>
                  <Text style={styles.toolCallText}>
                    {toolCallLabel(toolCall)}
                  </Text>
                  {detail === null ? null : <Text style={styles.toolCallDetailText}>{detail}</Text>}
                </View>
              )
            })}
          </View>
        )}
        {images.length === 0 ? null : (
          <View style={images.length === 1 ? styles.messageImageSingle : styles.messageImageGrid}>
            {images.map((part, index) => (
              <Image
                key={`${part.uri}-${index}`}
                resizeMode="cover"
                source={{ uri: part.uri }}
                style={images.length === 1 ? styles.messageImageFull : styles.messageImageThumb}
              />
            ))}
          </View>
        )}
        {files.length === 0 ? null : (
          <View style={styles.fileAttachmentList}>
            {files.map((part, index) => (
              <View key={`${part.name}-${part.size ?? 0}-${index}`} style={styles.fileAttachment}>
                <Text style={styles.fileAttachmentIcon}>{'\u{1F4C4}'}</Text>
                <View style={styles.fileAttachmentTextGroup}>
                  <Text numberOfLines={1} style={styles.fileAttachmentName}>{part.name}</Text>
                  <Text numberOfLines={1} style={styles.fileAttachmentMeta}>
                    {part.mimeType ?? 'Text file'}
                  </Text>
                </View>
              </View>
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
            {message.routeDecision.label}{' \u00B7 '}{Math.round(message.routeDecision.latencyMs)}ms
          </Text>
        )}
      </View>
    </View>
  )
}
