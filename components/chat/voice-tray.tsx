import { Text, View } from 'react-native'

import { VOICE_STATUS_LABELS } from '../../lib/chat/status-helpers'
import { voiceTransportLabel } from '../../lib/settings/copy'
import type { VoiceTransport } from '../../store/slices/settings'
import type { VoiceStatus } from '../../store/slices/voice'
import { styles } from './styles'

export type VoiceTrayProps = {
  readonly voiceError: string | null
  readonly voiceStatus: VoiceStatus
  readonly voiceTransport: VoiceTransport
  readonly voiceTranscript: string
}

export function VoiceTray({
  voiceError,
  voiceStatus,
  voiceTransport,
  voiceTranscript,
}: VoiceTrayProps) {
  const transportLabel = voiceTransportLabel(voiceTransport)

  return (
    <View style={styles.voiceTray}>
      <View style={styles.voiceTrayHeader}>
        <Text style={styles.voiceTrayLabel}>{VOICE_STATUS_LABELS[voiceStatus]}</Text>
        {voiceStatus === 'listening' || voiceStatus === 'speaking' ? (
          <Text style={styles.voiceTrayMeta}>{transportLabel}</Text>
        ) : null}
      </View>
      {voiceTranscript === '' ? null : <Text style={styles.voiceTranscript}>{voiceTranscript}</Text>}
      {voiceError === null ? null : <Text style={styles.voiceError}>{voiceError}</Text>}
    </View>
  )
}
