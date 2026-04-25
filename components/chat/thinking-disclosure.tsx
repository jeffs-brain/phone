import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'

import type { ThinkingDetail } from '../../lib/chat/message-helpers'
import { styles } from './styles'

export type ThinkingDisclosureProps = {
  readonly thinking: ThinkingDetail
}

export function ThinkingDisclosure({ thinking }: ThinkingDisclosureProps) {
  const [expanded, setExpanded] = useState(false)
  const hasDetail = thinking.text !== ''

  return (
    <View style={styles.thinkingPanel}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded, disabled: !hasDetail }}
        disabled={!hasDetail}
        onPress={() => setExpanded((value) => !value)}
        style={({ pressed }) => [
          styles.thinkingToggle,
          !hasDetail ? styles.thinkingToggleStatic : null,
          pressed ? styles.pressed : null,
        ]}
      >
        <Text style={styles.thinkingStatus}>{thinking.status}</Text>
        {hasDetail ? (
          <Text style={styles.thinkingToggleText}>{expanded ? '\u25BC' : '\u25B6'}</Text>
        ) : null}
      </Pressable>
      {expanded && hasDetail ? (
        <Text style={styles.thinkingText}>{thinking.text}</Text>
      ) : null}
    </View>
  )
}
