import { ActivityIndicator, Pressable, Text, View } from 'react-native'

import { isModelActivityStatus } from '../../lib/chat/status-helpers'
import { colors } from '../../lib/theme'
import type { ModelStatus } from '../../store/slices/inference'
import { styles } from './styles'

type DownloadBytes = {
  readonly received: number
  readonly total: number
}

export type ModelStatusBannerProps = {
  readonly downloadBytes: DownloadBytes | null
  readonly modelError: string | null
  readonly modelStatus: ModelStatus
  readonly onRetryModel: () => void
  readonly onUseSmallerModel: () => void
  readonly statusDotColour: string
  readonly statusPillLabel: string
}

export function ModelStatusBanner({
  downloadBytes,
  modelError,
  modelStatus,
  onRetryModel,
  onUseSmallerModel,
  statusDotColour,
  statusPillLabel,
}: ModelStatusBannerProps) {
  const progressLabel = downloadBytes === null || downloadBytes.total <= 0
    ? null
    : `${Math.round((downloadBytes.received / downloadBytes.total) * 100)}%`

  return (
    <>
      <View style={styles.statusPill}>
        <View style={[styles.statusDot, { backgroundColor: statusDotColour }]} />
        <Text style={styles.statusPillLabel} numberOfLines={1}>{statusPillLabel}</Text>
        {progressLabel === null ? null : <Text style={styles.statusProgressLabel}>{progressLabel}</Text>}
        {isModelActivityStatus(modelStatus) ? (
          <ActivityIndicator color={colors.accent.teal} size="small" />
        ) : null}
      </View>
      {modelStatus === 'error' ? (
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
      ) : null}
    </>
  )
}
