import { Pressable, Text, View } from 'react-native'

import type { ModelStatus } from '../../store/slices/inference'
import { styles } from './styles'

export type ModelStatusBannerProps = {
  readonly modelError: string | null
  readonly modelStatus: ModelStatus
  readonly onRetryModel: () => void
  readonly onUseSmallerModel: () => void
}

export function ModelStatusBanner({
  modelError,
  modelStatus,
  onRetryModel,
  onUseSmallerModel,
}: ModelStatusBannerProps) {
  if (modelStatus !== 'error') return null

  return (
    <View style={styles.statusErrorActions}>
      {modelError === null ? null : (
        <Text style={styles.statusErrorText} numberOfLines={2}>{modelError}</Text>
      )}
      <Pressable
        accessibilityRole="button"
        onPress={onRetryModel}
        style={({ pressed }) => [styles.statusActionButton, pressed ? styles.pressed : null]}
      >
        <Text style={styles.statusActionText}>Retry</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={onUseSmallerModel}
        style={({ pressed }) => [
          styles.statusActionButton,
          styles.secondaryStatusActionButton,
          pressed ? styles.pressed : null,
        ]}
      >
        <Text style={styles.secondaryStatusActionText}>Use E2B</Text>
      </Pressable>
    </View>
  )
}
