import { Pressable, Text, View } from 'react-native'

import { styles } from './styles'

export type ChatHeaderProps = {
  readonly onNewThread: () => void
  readonly onOpenMemories: () => void
  readonly onOpenSettings: () => void
}

export function ChatHeader({
  onNewThread,
  onOpenMemories,
  onOpenSettings,
}: ChatHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.titleGroup}>
        <Text style={styles.eyebrow}>Private phone brain</Text>
        <Text style={styles.title}>Jeff</Text>
      </View>
      <View style={styles.headerActions}>
        <Pressable
          accessibilityLabel="New chat"
          accessibilityRole="button"
          onPress={onNewThread}
          style={({ pressed }) => [
            styles.headerIconButton,
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
