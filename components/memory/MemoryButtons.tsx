import { Pressable, StyleSheet, Text } from 'react-native'

import { colors, radius } from '../../lib/theme'

type DoneButtonProps = {
  readonly onPress: () => void
}

type HeaderButtonProps = {
  readonly label: string
  readonly onPress: () => void
  readonly muted?: boolean
  readonly disabled?: boolean
}

export function DoneButton({ onPress }: DoneButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.doneButton,
        pressed ? styles.pressed : null,
      ]}
    >
      <Text style={styles.doneButtonText}>✓ Done</Text>
    </Pressable>
  )
}

export function HeaderButton({
  label,
  onPress,
  muted = false,
  disabled = false,
}: HeaderButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.headerButton,
        muted ? styles.mutedButton : null,
        disabled ? styles.disabledButton : null,
        pressed ? styles.pressed : null,
      ]}
    >
      <Text style={[
        styles.headerButtonText,
        muted ? styles.mutedButtonText : null,
        disabled ? styles.disabledText : null,
      ]}>
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  doneButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  doneButtonText: {
    color: colors.accent.teal,
    fontSize: 17,
    fontWeight: '600',
  },
  headerButton: {
    alignItems: 'center',
    backgroundColor: colors.accent.teal,
    borderRadius: radius.sm,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  headerButtonText: {
    color: colors.text.onAccent,
    fontSize: 14,
    fontWeight: '600',
  },
  mutedButton: {
    backgroundColor: colors.bg.secondary,
  },
  mutedButtonText: {
    color: colors.text.primary,
  },
  disabledButton: {
    opacity: 0.52,
  },
  disabledText: {
    color: colors.text.secondary,
  },
  pressed: {
    opacity: 0.72,
  },
})
