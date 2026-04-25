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
      <View style={styles.stagedTrayHeader}>
        <Text style={styles.stagedTrayTitle}>
          {attachments.length === 1 ? '1 attachment' : `${attachments.length} attachments`}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => { hapticButton(); onClear() }}
          style={({ pressed }) => [styles.clearStagedButton, pressed ? styles.pressed : null]}
        >
          <Text style={styles.clearStagedText}>{'\u{1F5D1}\uFE0F'}</Text>
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
