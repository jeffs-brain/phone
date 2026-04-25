import { Pressable, Text, View } from 'react-native'

import { hapticButton } from '../../lib/haptics'
import { styles } from './styles'

export type EmptyStateProps = {
  readonly onSuggestion: (text: string) => void
}

export function EmptyState({ onSuggestion }: EmptyStateProps) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyAvatar}>
        <Text style={styles.emptyAvatarText}>J</Text>
      </View>
      <Text style={styles.emptyTitle}>Hey, I'm Jeff {'\u{1F4AC}'}</Text>
      <Text style={styles.emptyCopy}>Local-first chat, private memory, and explicit provider control.</Text>
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
