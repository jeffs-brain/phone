import { ActivityIndicator, Pressable, Text, View } from 'react-native'

import { isModelActivityStatus } from '../../lib/chat/status-helpers'
import { colors } from '../../lib/theme'
import type { ModelStatus } from '../../store/slices/inference'
import { styles } from './styles'

export type ModelStatusBannerProps = {
  readonly modelStatus: ModelStatus
  readonly onRetryModel: () => void
  readonly onUseSmallerModel: () => void
  readonly statusDotColour: string
  readonly statusPillLabel: string
}

export function ModelStatusBanner({
  modelStatus,
  onRetryModel,
  onUseSmallerModel,
  statusDotColour,
  statusPillLabel,
}: ModelStatusBannerProps) {
  return (
    <>
      <View style={styles.statusPill}>
        <View style={[styles.statusDot, { backgroundColor: statusDotColour }]} />
        <Text style={styles.statusPillLabel} numberOfLines={1}>{statusPillLabel}</Text>
        {isModelActivityStatus(modelStatus) ? (
          <ActivityIndicator color={colors.accent.teal} size="small" />
        ) : null}
      </View>
      {modelStatus === 'error' ? (
        <View style={styles.statusErrorActions}>
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
      ) : null}
    </>
  )
}
