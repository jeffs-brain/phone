import { Pressable, StyleSheet, Text, View } from 'react-native'

import {
  cleanMemoryText,
  formatMemoryDate,
  formatRelativeDate,
} from '../../lib/memory-display'
import { colors, radius, shadows } from '../../lib/theme'
import type { MemoryNoteSummary } from '../../store/slices/memory'

type MemoryNoteCardProps = {
  readonly note: MemoryNoteSummary
  readonly expanded: boolean
  readonly deleting: boolean
  readonly onToggle: (path: string) => void
  readonly onDelete: (note: MemoryNoteSummary) => void
}

export function MemoryNoteCard({
  note,
  expanded,
  deleting,
  onToggle,
  onDelete,
}: MemoryNoteCardProps) {
  const preview = cleanMemoryText(note.preview) || cleanMemoryText(note.description)
  const indexEntry = cleanMemoryText(note.indexEntry)
  const content = cleanMemoryText(note.content)
  const tags = note.tags.slice(0, 6)

  return (
    <View style={styles.memoryCard}>
      <View style={styles.memoryHeader}>
        <View style={styles.memoryCopy}>
          <View style={styles.memoryNameRow}>
            <Text style={styles.memoryName} numberOfLines={2}>{note.name}</Text>
            <View style={styles.typePill}>
              <Text style={styles.typePillText}>{note.type}</Text>
            </View>
          </View>
          <Text style={styles.memoryMeta}>
            {formatMemoryDate(note.modified)} · {formatRelativeDate(note.modified)}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={deleting}
          onPress={() => onDelete(note)}
          style={({ pressed }) => [
            styles.deleteButton,
            deleting ? styles.disabledButton : null,
            pressed ? styles.pressed : null,
          ]}
        >
          <Text style={[styles.deleteText, deleting ? styles.disabledText : null]}>
            {deleting ? '🗑️ Deleting' : '🗑️ Delete'}
          </Text>
        </Pressable>
      </View>

      {preview === '' ? null : <Text style={styles.memoryPreview}>{preview}</Text>}
      {tags.length === 0 ? null : (
        <View style={styles.tagsRow}>
          {tags.map((tag) => (
            <View key={tag} style={styles.tagPill}>
              <Text style={styles.tagPillText}>{tag}</Text>
            </View>
          ))}
        </View>
      )}

      <Pressable
        accessibilityRole="button"
        onPress={() => onToggle(note.path)}
        style={({ pressed }) => [styles.detailButton, pressed ? styles.pressed : null]}
      >
        <Text style={styles.detailButtonText}>{expanded ? '▼ Hide' : '▶ Details'}</Text>
      </Pressable>

      {expanded ? (
        <View style={styles.detailPanel}>
          {indexEntry === '' ? null : (
            <View style={styles.detailBlock}>
              <Text style={styles.detailLabel}>Index entry</Text>
              <Text style={styles.detailText}>{indexEntry}</Text>
            </View>
          )}
          {content === '' ? null : (
            <View style={styles.detailBlock}>
              <Text style={styles.detailLabel}>Content</Text>
              <Text style={styles.detailText}>{content}</Text>
            </View>
          )}
          <View style={styles.detailBlock}>
            <Text style={styles.detailLabel}>Created</Text>
            <Text style={styles.detailText}>{formatMemoryDate(note.created)}</Text>
          </View>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  memoryCard: {
    backgroundColor: colors.bg.card,
    borderRadius: radius.md,
    paddingHorizontal: 13,
    paddingVertical: 12,
    ...shadows[1],
  },
  memoryHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
  },
  memoryCopy: {
    flex: 1,
  },
  memoryNameRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  memoryName: {
    color: colors.text.primary,
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 22,
  },
  typePill: {
    backgroundColor: colors.bg.secondary,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  typePillText: {
    color: colors.text.secondary,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  memoryMeta: {
    color: colors.text.secondary,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 3,
  },
  deleteButton: {
    alignItems: 'center',
    backgroundColor: colors.button.destructive.bg,
    borderRadius: radius.sm,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 11,
  },
  deleteText: {
    color: colors.accent.error,
    fontSize: 13,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.52,
  },
  disabledText: {
    color: colors.text.secondary,
  },
  memoryPreview: {
    color: colors.text.primary,
    fontSize: 15,
    lineHeight: 21,
    marginTop: 10,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 9,
  },
  tagPill: {
    backgroundColor: 'rgba(18, 184, 158, 0.1)',
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  tagPillText: {
    color: colors.accent.teal,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  detailButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.bg.secondary,
    borderRadius: radius.sm,
    minHeight: 44,
    justifyContent: 'center',
    marginTop: 11,
    paddingHorizontal: 12,
  },
  detailButtonText: {
    color: colors.text.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  detailPanel: {
    borderTopColor: colors.divider,
    borderTopWidth: 1,
    gap: 12,
    marginTop: 12,
    paddingTop: 12,
  },
  detailBlock: {
    gap: 5,
  },
  detailLabel: {
    color: colors.text.secondary,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  detailText: {
    color: colors.text.primary,
    fontSize: 14,
    lineHeight: 20,
  },
  pressed: {
    opacity: 0.72,
  },
})
