import { ActivityIndicator, Pressable, Text, View } from 'react-native'

import { isModelActivityStatus } from '../../lib/chat/status-helpers'
import { colors } from '../../lib/theme'
import type { ModelStatus } from '../../store/slices/inference'
import { styles } from './styles'

export type ChatHeaderProps = {
  readonly modelStatus: ModelStatus
  readonly onNewThread: () => void
  readonly onOpenMemories: () => void
  readonly onOpenSettings: () => void
  readonly statusDotColour: string
  readonly statusPillLabel: string
}

export function ChatHeader({
  modelStatus,
  onNewThread,
  onOpenMemories,
  onOpenSettings,
  statusDotColour,
  statusPillLabel,
}: ChatHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.headerActions}>
        <View style={styles.statusPill}>
          <View style={[styles.statusDot, { backgroundColor: statusDotColour }]} />
          <Text style={styles.statusPillLabel} numberOfLines={1}>{statusPillLabel}</Text>
          {isModelActivityStatus(modelStatus) ? (
            <ActivityIndicator color={colors.accent.teal} size="small" />
          ) : null}
        </View>
        <Pressable
          accessibilityLabel="New chat"
          accessibilityRole="button"
          onPress={onNewThread}
          style={({ pressed }) => [
            styles.headerIconButton,
            { marginLeft: 'auto' },
            pressed ? styles.pressed : null,
          ]}
        >
          <Text style={styles.headerIconText}>{'\u2728'}</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Memories"
          accessibilityRole="button"
          onPress={onOpenMemories}
          style={({ pressed }) => [styles.headerIconButton, pressed ? styles.pressed : null]}
        >
          <Text style={styles.headerIconText}>{'\u{1F9E0}'}</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Settings"
          accessibilityRole="button"
          onPress={onOpenSettings}
          style={({ pressed }) => [styles.headerIconButton, pressed ? styles.pressed : null]}
        >
          <Text style={styles.headerIconText}>{'\u2699\uFE0F'}</Text>
        </Pressable>
      </View>
    </View>
  )
}
