import { StyleSheet, Text, View } from 'react-native'

import { formatLogTime } from '../../lib/memory-display'
import { colors, radius, shadows } from '../../lib/theme'
import type { ToolLogEntry } from '../../store/slices/memory'

type ToolLogRowProps = {
  readonly entry: ToolLogEntry
}

export function ToolLogRow({ entry }: ToolLogRowProps) {
  return (
    <View style={styles.toolLogRow}>
      <View style={styles.toolLogCopy}>
        <Text style={styles.toolLogName}>{entry.tool.replace(/_/g, ' ')}</Text>
        {entry.detail === undefined ? null : (
          <Text style={styles.toolLogDetail} numberOfLines={2}>{entry.detail}</Text>
        )}
      </View>
      <View style={styles.toolLogMeta}>
        <Text style={styles.toolLogStatus}>{entry.status}</Text>
        <Text style={styles.toolLogTime}>{formatLogTime(entry.ts)}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  toolLogRow: {
    backgroundColor: colors.bg.card,
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    ...shadows[1],
  },
  toolLogCopy: {
    flex: 1,
  },
  toolLogName: {
    color: colors.text.primary,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  toolLogDetail: {
    color: colors.text.secondary,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  toolLogMeta: {
    alignItems: 'flex-end',
  },
  toolLogStatus: {
    color: colors.accent.teal,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  toolLogTime: {
    color: colors.text.secondary,
    fontSize: 12,
    marginTop: 3,
  },
})
