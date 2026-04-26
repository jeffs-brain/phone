import { Pressable, Text, TextInput, View } from 'react-native'

import { colors } from '../../lib/theme'
import type { VoiceTransport } from '../../store/slices/settings'
import type { VoiceStatus } from '../../store/slices/voice'
import type { ContentPart } from '../../store/types'
import { GlassSurface } from './glass-surface'
import { StagedAttachmentTray } from './staged-attachment-tray'
import { styles } from './styles'
import { VoiceTray } from './voice-tray'

export type ChatComposerProps = {
  readonly actionError: string | null
  readonly bottomInset: number
  readonly canSend: boolean
  readonly draft: string
  readonly generationActive: boolean
  readonly onCancel: () => void
  readonly onChangeDraft: (text: string) => void
  readonly onClearStaged: () => void
  readonly onMic: () => void
  readonly onPickFile: () => void
  readonly onPickImage: () => void
  readonly onRemoveStagedAttachment: (index: number) => void
  readonly onSend: () => void
  readonly showVoiceTray: boolean
  readonly stagedAttachments: readonly ContentPart[]
  readonly voiceBusy: boolean
  readonly voiceCanPress: boolean
  readonly voiceError: string | null
  readonly voiceStatus: VoiceStatus
  readonly voiceTransport: VoiceTransport
  readonly voiceTranscript: string
}

const getVoiceButtonText = (voiceStatus: VoiceStatus): string => {
  if (voiceStatus === 'listening' || voiceStatus === 'speaking') return '\u23F9\uFE0F'
  if (voiceStatus === 'connecting' || voiceStatus === 'requesting-permission') return '\u2716\uFE0F'
  return '\u{1F399}\uFE0F'
}

const getVoiceAccessibilityLabel = (voiceStatus: VoiceStatus): string => {
  if (voiceStatus === 'listening') return 'Stop recording'
  if (voiceStatus === 'speaking') return 'Stop speaking'
  if (voiceStatus === 'connecting' || voiceStatus === 'requesting-permission') return 'Cancel voice'
  return 'Start voice'
}

export function ChatComposer({
  actionError,
  bottomInset,
  canSend,
  draft,
  generationActive,
  onCancel,
  onChangeDraft,
  onClearStaged,
  onMic,
  onPickFile,
  onPickImage,
  onRemoveStagedAttachment,
  onSend,
  showVoiceTray,
  stagedAttachments,
  voiceBusy,
  voiceCanPress,
  voiceError,
  voiceStatus,
  voiceTransport,
  voiceTranscript,
}: ChatComposerProps) {
  return (
    <View style={[styles.composerWrap, { paddingBottom: Math.max(bottomInset, 12) }]}>
      {actionError === null ? null : <Text style={styles.errorText}>{'\u26A0\uFE0F'} {actionError}</Text>}
      {showVoiceTray ? (
        <VoiceTray
          voiceError={voiceError}
          voiceStatus={voiceStatus}
          voiceTransport={voiceTransport}
          voiceTranscript={voiceTranscript}
        />
      ) : null}
      <StagedAttachmentTray
        attachments={stagedAttachments}
        onClear={onClearStaged}
        onRemove={onRemoveStagedAttachment}
      />
      <GlassSurface effect="regular" style={styles.composer} tintColor="rgba(243, 239, 236, 0.74)">
        <TextInput
          accessibilityLabel="Message Jeff"
          accessibilityHint="Type a message to send to Jeff."
          multiline
          value={draft}
          onChangeText={onChangeDraft}
          onSubmitEditing={onSend}
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
              accessibilityHint="Choose a photo to send with your message."
              accessibilityRole="button"
              onPress={onPickImage}
              style={({ pressed }) => [styles.attachmentButton, pressed ? styles.pressed : null]}
            >
              <Text style={styles.attachmentButtonText}>{'\u{1F5BC}\uFE0F'}</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Attach file"
              accessibilityHint="Choose a file to send with your message."
              accessibilityRole="button"
              onPress={onPickFile}
              style={({ pressed }) => [styles.attachmentButton, pressed ? styles.pressed : null]}
            >
              <Text style={styles.attachmentButtonText}>{'\u{1F4CE}'}</Text>
            </Pressable>
            <Pressable
              accessibilityLabel={getVoiceAccessibilityLabel(voiceStatus)}
              accessibilityHint="Use voice input for your message."
              accessibilityRole="button"
              accessibilityState={{ disabled: !voiceCanPress, selected: voiceBusy }}
              disabled={!voiceCanPress}
              onPress={onMic}
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
                {getVoiceButtonText(voiceStatus)}
              </Text>
            </Pressable>
          </View>
          {generationActive ? (
            <Pressable
              accessibilityLabel="Stop response"
              accessibilityRole="button"
              onPress={onCancel}
              style={({ pressed }) => [styles.cancelButton, pressed ? styles.pressed : null]}
            >
              <Text style={styles.cancelButtonText}>{'\u23F9\uFE0F'}</Text>
            </Pressable>
          ) : (
            <Pressable
              accessibilityLabel="Send message"
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSend }}
              disabled={!canSend}
              onPress={onSend}
              style={({ pressed }) => [
                styles.sendButton,
                !canSend ? styles.disabledSendButton : null,
                pressed ? styles.pressed : null,
              ]}
            >
              <Text style={[styles.sendButtonText, !canSend ? styles.disabledSendButtonText : null]}>
                {'\u2B06\uFE0F'}
              </Text>
            </Pressable>
          )}
        </View>
      </GlassSurface>
    </View>
  )
}
