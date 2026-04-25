import { Image, Pressable, ScrollView, Text, View } from 'react-native'

import { hapticButton } from '../../lib/haptics'
import {
  getStagedAttachmentKey,
  getStagedAttachmentLabel,
} from '../../lib/chat/message-helpers'
import type { ContentPart } from '../../store/types'
import { styles } from './styles'

type StagedAttachmentPreviewProps = {
  readonly index: number
  readonly onRemove: (index: number) => void
  readonly part: ContentPart
}

function StagedAttachmentPreview({
  index,
  onRemove,
  part,
}: StagedAttachmentPreviewProps) {
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
          <Text style={styles.stagedFileIcon}>{'\u{1F4C4}'}</Text>
          <Text numberOfLines={1} style={styles.stagedFileName}>{label}</Text>
        </View>
      )}
      <Pressable
        accessibilityLabel={`Remove ${label}`}
        accessibilityRole="button"
        hitSlop={10}
        onPress={() => { hapticButton(); onRemove(index) }}
        style={({ pressed }) => [styles.stagedRemoveButton, pressed ? styles.pressed : null]}
      >
        <Text style={styles.stagedRemoveText}>{'×'}</Text>
      </Pressable>
      {part.type === 'image' ? (
        <View style={styles.stagedImageLabelRow}>
          <Text numberOfLines={1} style={styles.stagedAttachmentLabel}>{label}</Text>
        </View>
      ) : null}
    </View>
  )
}

export type StagedAttachmentTrayProps = {
  readonly attachments: readonly ContentPart[]
  readonly onClear: () => void
  readonly onRemove: (index: number) => void
}

export function StagedAttachmentTray({
  attachments,
  onClear,
  onRemove,
}: StagedAttachmentTrayProps) {
  if (attachments.length === 0) return null

  return (
    <View style={styles.stagedTray}>
      <ScrollView
        accessibilityLabel="Staged attachments"
        horizontal
        keyboardShouldPersistTaps="handled"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.stagedScrollerContent}
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
      {attachments.length > 1 ? (
        <Pressable
          accessibilityLabel="Clear all attachments"
          accessibilityRole="button"
          onPress={() => { hapticButton(); onClear() }}
          style={({ pressed }) => [styles.clearAllButton, pressed ? styles.pressed : null]}
        >
          <Text style={styles.clearAllText}>Clear all</Text>
        </Pressable>
      ) : null}
    </View>
  )
}
