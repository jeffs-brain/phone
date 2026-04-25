import { Text, View } from 'react-native'

import { VOICE_STATUS_LABELS } from '../../lib/chat/status-helpers'
import type { VoiceStatus } from '../../store/slices/voice'
import { styles } from './styles'

export type VoiceTrayProps = {
  readonly voiceError: string | null
  readonly voiceStatus: VoiceStatus
  readonly voiceTranscript: string
}

export function VoiceTray({
  voiceError,
  voiceStatus,
  voiceTranscript,
}: VoiceTrayProps) {
  return (
    <View style={styles.voiceTray}>
      <View style={styles.voiceTrayHeader}>
        <Text style={styles.voiceTrayLabel}>{VOICE_STATUS_LABELS[voiceStatus]}</Text>
        {voiceStatus === 'listening' || voiceStatus === 'speaking' ? (
          <Text style={styles.voiceTrayMeta}>{voiceStatus === 'speaking' ? 'Gradium TTS' : 'Gradium STT'}</Text>
        ) : null}
      </View>
      {voiceTranscript === '' ? null : <Text style={styles.voiceTranscript}>{voiceTranscript}</Text>}
      {voiceError === null ? null : <Text style={styles.voiceError}>{voiceError}</Text>}
    </View>
  )
}
