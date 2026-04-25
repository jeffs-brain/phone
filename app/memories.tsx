import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'expo-router'
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

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
          <Text style={styles.memoryName} numberOfLines={2}>{note.name}</Text>
          <Text style={styles.memoryMeta}>{note.type} / {formatMemoryDate(note.modified)}</Text>
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
            {deleting ? 'Deleting' : 'Delete'}
          </Text>
        </Pressable>
      </View>

      {preview === '' ? null : <Text style={styles.memoryPreview}>{preview}</Text>}
      {tags.length === 0 ? null : <Text style={styles.memoryTags}>{tags.join(', ')}</Text>}
      <Text style={styles.memoryPath} numberOfLines={2}>{note.path}</Text>

      <Pressable
        accessibilityRole="button"
        onPress={() => onToggle(note.path)}
        style={({ pressed }) => [styles.detailButton, pressed ? styles.pressed : null]}
      >
        <Text style={styles.detailButtonText}>{expanded ? 'Hide details' : 'Show details'}</Text>
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
  const memoryNotes = useStore((s) => s.memoryNotes)
  const memoryNotesStatus = useStore((s) => s.memoryNotesStatus)
  const memoryNotesError = useStore((s) => s.memoryNotesError)
  const lastExtractionSummary = useStore((s) => s.lastExtractionSummary)
  const toolLog = useStore((s) => s.toolLog)
  const recentMemoryLog = useMemo(() => recentVisibleMemoryLog(toolLog), [toolLog])
  const loading = memoryNotesStatus === 'loading'

  useEffect(() => {
    void memoryService.listMemories()
  }, [])

  const handleRefresh = useCallback(() => {
    void memoryService.listMemories()
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
        <HeaderButton label="Done" onPress={handleDone} muted />
      </View>

      <View style={styles.actionRow}>
        <HeaderButton label={loading ? 'Refreshing' : 'Refresh'} onPress={handleRefresh} muted disabled={loading} />
      </View>

      {lastExtractionSummary === null ? null : (
        <View style={styles.statusPanel}>
          <Text style={styles.statusLabel}>Last extraction</Text>
          <Text style={styles.statusText}>{lastExtractionSummary}</Text>
        </View>
      )}
      {memoryNotesError === null ? null : <Text style={styles.errorText}>{memoryNotesError}</Text>}

      {memoryNotes.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No memories yet</Text>
          <Text style={styles.emptyDetail}>
            Ask Jeff to remember something, or keep conversation memory enabled.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {memoryNotes.map((note) => (
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
    backgroundColor: '#080a0f',
    flex: 1,
  },
  content: {
    paddingHorizontal: 18,
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
    color: '#8b93a7',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  title: {
    color: '#f6f7fb',
    fontSize: 31,
    fontWeight: '800',
    letterSpacing: 0,
    marginTop: 2,
  },
  subtitle: {
    color: '#9aa3b5',
    fontSize: 13,
    marginTop: 3,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  headerButton: {
    alignItems: 'center',
    backgroundColor: '#8be9d4',
    borderRadius: 8,
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  headerButtonText: {
    color: '#07110f',
    fontSize: 14,
    fontWeight: '900',
  },
  mutedButton: {
    backgroundColor: '#171b25',
    borderColor: '#2d3444',
    borderWidth: 1,
  },
  mutedButtonText: {
    color: '#f4f7fb',
  },
  disabledButton: {
    opacity: 0.52,
  },
  disabledText: {
    color: '#9aa3b5',
  },
  statusPanel: {
    backgroundColor: '#10141d',
    borderColor: '#252b3a',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  statusLabel: {
    color: '#8b93a7',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  statusText: {
    color: '#f4f7fb',
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20,
    marginTop: 4,
  },
  errorText: {
    color: '#ff9b9b',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  emptyState: {
    backgroundColor: '#10141d',
    borderColor: '#252b3a',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 18,
  },
  emptyTitle: {
    color: '#f4f7fb',
    fontSize: 16,
    fontWeight: '800',
  },
  emptyDetail: {
    color: '#9aa3b5',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 5,
  },
  list: {
    gap: 12,
  },
  memoryCard: {
    backgroundColor: '#10141d',
    borderColor: '#252b3a',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  memoryHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
  },
  memoryCopy: {
    flex: 1,
  },
  memoryName: {
    color: '#f4f7fb',
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 21,
  },
  memoryMeta: {
    color: '#8b93a7',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 3,
    textTransform: 'uppercase',
  },
  deleteButton: {
    alignItems: 'center',
    backgroundColor: '#2a1720',
    borderColor: '#693143',
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 11,
  },
  deleteText: {
    color: '#ffb8c7',
    fontSize: 13,
    fontWeight: '900',
  },
  memoryPreview: {
    color: '#d9deea',
    fontSize: 15,
    lineHeight: 21,
    marginTop: 10,
  },
  memoryTags: {
    color: '#8fcbb9',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 9,
    textTransform: 'uppercase',
  },
  memoryPath: {
    color: '#70798d',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 8,
  },
  detailButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#171b25',
    borderColor: '#2d3444',
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 36,
    justifyContent: 'center',
    marginTop: 11,
    paddingHorizontal: 12,
  },
  detailButtonText: {
    color: '#f4f7fb',
    fontSize: 13,
    fontWeight: '900',
  },
  detailPanel: {
    borderTopColor: '#252b3a',
    borderTopWidth: 1,
    gap: 12,
    marginTop: 12,
    paddingTop: 12,
  },
  detailBlock: {
    gap: 5,
  },
  detailLabel: {
    color: '#8b93a7',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  detailText: {
    color: '#d9deea',
    fontSize: 14,
    lineHeight: 20,
  },
  toolLogPanel: {
    borderTopColor: '#1c2230',
    borderTopWidth: 1,
    gap: 8,
    marginTop: 20,
    paddingTop: 16,
  },
  toolLogTitle: {
    color: '#f4f7fb',
    fontSize: 16,
    fontWeight: '800',
  },
  toolLogRow: {
    backgroundColor: '#10141d',
    borderColor: '#252b3a',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  toolLogCopy: {
    flex: 1,
  },
  toolLogName: {
    color: '#f4f7fb',
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'capitalize',
  },
  toolLogDetail: {
    color: '#9aa3b5',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  toolLogMeta: {
    alignItems: 'flex-end',
  },
  toolLogStatus: {
    color: '#8fcbb9',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  toolLogTime: {
    color: '#70798d',
    fontSize: 12,
    marginTop: 3,
  },
  pressed: {
    opacity: 0.72,
  },
})
