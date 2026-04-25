import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'expo-router'
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { colors, radius, shadows, typography } from '../lib/theme'
import { memoryService } from '../services/memory'
import { useStore } from '../store'
import type { MemoryNoteSummary, ToolLogEntry } from '../store/slices/memory'

const formatMemoryDate = (value: string): string => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString([], {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

const formatRelativeDate = (value: string): string => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const now = Date.now()
  const diffMs = now - date.getTime()
  const diffSeconds = Math.floor(diffMs / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSeconds < 60) return 'just now'
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
  return `${Math.floor(diffDays / 30)}mo ago`
}

const formatLogTime = (value: number): string =>
  new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

const memoryStatusCopy = (status: string, count: number): string => {
  if (status === 'loading') return count === 0 ? 'Loading memories' : 'Refreshing memories'
  if (count === 0) return 'No durable memories stored yet'
  return `${count} stored memor${count === 1 ? 'y' : 'ies'}`
}

const cleanText = (value: string | undefined): string => value?.trim() ?? ''

const isOpenLogEntry = (entry: ToolLogEntry): boolean =>
  entry.status === 'pending' || entry.status === 'running'

const recentVisibleMemoryLog = (entries: readonly ToolLogEntry[]): ToolLogEntry[] => {
  const recent = entries.slice(-24)
  const visible = recent
    .filter((entry, index) => {
      if (!isOpenLogEntry(entry)) return true
      return !recent
        .slice(index + 1)
        .some((candidate) => candidate.tool === entry.tool && !isOpenLogEntry(candidate))
    })
  const seen = new Set<string>()
  const unique: ToolLogEntry[] = []

  for (const entry of visible.slice().reverse()) {
    const key = `${entry.tool}:${entry.status}:${entry.detail ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(entry)
    if (unique.length === 8) break
  }

  return unique
}

function DoneButton({
  onPress,
}: {
  readonly onPress: () => void
}) {
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

function HeaderButton({
  label,
  onPress,
  muted = false,
  disabled = false,
}: {
  readonly label: string
  readonly onPress: () => void
  readonly muted?: boolean
  readonly disabled?: boolean
}) {
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
      <Text style={[styles.headerButtonText, muted ? styles.mutedButtonText : null, disabled ? styles.disabledText : null]}>
        {label}
      </Text>
    </Pressable>
  )
}

function MemoryNoteCard({
  note,
  expanded,
  deleting,
  onToggle,
  onDelete,
}: {
  readonly note: MemoryNoteSummary
  readonly expanded: boolean
  readonly deleting: boolean
  readonly onToggle: (path: string) => void
  readonly onDelete: (note: MemoryNoteSummary) => void
}) {
  const preview = cleanText(note.preview) || cleanText(note.description)
  const indexEntry = cleanText(note.indexEntry)
  const content = cleanText(note.content)
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
          <Text style={styles.memoryMeta}>{formatMemoryDate(note.modified)} · {formatRelativeDate(note.modified)}</Text>
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

function ToolLogRow({ entry }: { readonly entry: ToolLogEntry }) {
  return (
    <View style={styles.toolLogRow}>
      <View style={styles.toolLogCopy}>
        <Text style={styles.toolLogName}>{entry.tool.replace(/_/g, ' ')}</Text>
        {entry.detail === undefined ? null : <Text style={styles.toolLogDetail} numberOfLines={2}>{entry.detail}</Text>}
      </View>
      <View style={styles.toolLogMeta}>
        <Text style={styles.toolLogStatus}>{entry.status}</Text>
        <Text style={styles.toolLogTime}>{formatLogTime(entry.ts)}</Text>
      </View>
    </View>
  )
}

export default function Memories() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const [expandedPath, setExpandedPath] = useState<string | null>(null)
  const [deletingPath, setDeletingPath] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const memoryNotes = useStore((s) => s.memoryNotes)
  const memoryNotesStatus = useStore((s) => s.memoryNotesStatus)
  const memoryNotesError = useStore((s) => s.memoryNotesError)
  const lastExtractionSummary = useStore((s) => s.lastExtractionSummary)
  const toolLog = useStore((s) => s.toolLog)
  const recentMemoryLog = useMemo(() => recentVisibleMemoryLog(toolLog), [toolLog])
  const loading = memoryNotesStatus === 'loading'

  const filteredNotes = useMemo(() => {
    if (searchQuery.trim() === '') return memoryNotes
    const query = searchQuery.toLowerCase()
    return memoryNotes.filter((note) =>
      note.name.toLowerCase().includes(query) ||
      note.preview?.toLowerCase().includes(query) ||
      note.description?.toLowerCase().includes(query) ||
      note.tags.join(' ').toLowerCase().includes(query),
    )
  }, [memoryNotes, searchQuery])

  useEffect(() => {
    void memoryService.listMemories()
  }, [])

  const handleRefresh = useCallback(() => {
    void memoryService.listMemories()
  }, [])

  const handleTidy = useCallback(() => {
    void memoryService.consolidateMemories()
  }, [])

  const handleToggle = useCallback((path: string) => {
    setExpandedPath((current) => current === path ? null : path)
  }, [])

  const handleDelete = useCallback((note: MemoryNoteSummary) => {
    Alert.alert(
      'Delete memory?',
      `${note.name}\n\n${note.path}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setDeletingPath(note.path)
            void memoryService.deleteMemory(note.path).then((deleted) => {
              if (deleted && expandedPath === note.path) setExpandedPath(null)
            }).finally(() => setDeletingPath(null))
          },
        },
      ],
    )
  }, [expandedPath])

  const handleDone = useCallback(() => {
    if (router.canGoBack()) {
      router.back()
      return
    }
    router.replace('/')
  }, [router])

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 28 }]}
    >
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>Private Phone Brain</Text>
          <Text style={styles.title}>Memories</Text>
          <Text style={styles.subtitle}>{memoryStatusCopy(memoryNotesStatus, memoryNotes.length)}</Text>
        </View>
        <DoneButton onPress={handleDone} />
      </View>

      <View style={styles.actionRow}>
        <HeaderButton label={loading ? '🔄 Refreshing' : '🔄 Refresh'} onPress={handleRefresh} muted disabled={loading} />
        <HeaderButton label="🧹 Tidy" onPress={handleTidy} muted disabled={loading || memoryNotes.length < 2} />
      </View>

      {lastExtractionSummary === null ? null : (
        <View style={styles.statusPanel}>
          <Text style={styles.statusLabel}>Last extraction</Text>
          <Text style={styles.statusText}>{lastExtractionSummary}</Text>
        </View>
      )}
      {memoryNotesError === null ? null : <Text style={styles.errorText}>⚠️ {memoryNotesError}</Text>}

      {memoryNotes.length > 0 ? (
        <TextInput
          style={styles.searchBar}
          placeholder="Search memories"
          placeholderTextColor={colors.text.muted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      ) : null}

      {memoryNotes.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>🧠</Text>
          <Text style={styles.emptyTitle}>Jeff hasn't stored any memories yet</Text>
          <Text style={styles.emptyDetail}>
            As you chat, Jeff will remember the important things about you.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {filteredNotes.map((note) => (
            <MemoryNoteCard
              key={note.path}
              note={note}
              expanded={expandedPath === note.path}
              deleting={deletingPath === note.path}
              onToggle={handleToggle}
              onDelete={handleDelete}
            />
          ))}
        </View>
      )}

      {recentMemoryLog.length === 0 ? null : (
        <View style={styles.toolLogPanel}>
          <Text style={styles.toolLogTitle}>Recent memory activity</Text>
          {recentMemoryLog.map((entry) => <ToolLogRow key={entry.id} entry={entry} />)}
        </View>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.bg.grouped,
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  headerCopy: {
    flex: 1,
    paddingRight: 14,
  },
  eyebrow: {
    color: colors.text.secondary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.text.primary,
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: 0,
    marginTop: 2,
  },
  subtitle: {
    color: colors.text.secondary,
    fontSize: 13,
    marginTop: 3,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
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
  statusPanel: {
    backgroundColor: colors.bg.card,
    borderRadius: radius.md,
    marginBottom: 12,
    paddingHorizontal: 13,
    paddingVertical: 11,
    ...shadows[1],
  },
  statusLabel: {
    color: colors.text.secondary,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  statusText: {
    color: colors.text.primary,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
    marginTop: 4,
  },
  errorText: {
    color: colors.accent.error,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  searchBar: {
    backgroundColor: colors.bg.secondary,
    borderRadius: radius.sm,
    color: colors.text.primary,
    fontSize: 15,
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 32,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    color: colors.text.primary,
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyDetail: {
    color: colors.text.secondary,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 6,
    textAlign: 'center',
  },
  list: {
    gap: 16,
  },
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
  toolLogPanel: {
    borderTopColor: colors.divider,
    borderTopWidth: 1,
    gap: 8,
    marginTop: 20,
    paddingTop: 16,
  },
  toolLogTitle: {
    color: colors.text.primary,
    fontSize: 17,
    fontWeight: '600',
  },
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
  pressed: {
    opacity: 0.72,
  },
})
