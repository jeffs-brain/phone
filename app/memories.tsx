import { useCallback, useEffect, useMemo, useState } from 'react'
import * as DocumentPicker from 'expo-document-picker'
import { useRouter } from 'expo-router'
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { DoneButton, HeaderButton } from '../components/memory/MemoryButtons'
import { MemoryNoteCard } from '../components/memory/MemoryNoteCard'
import { ToolLogRow } from '../components/memory/ToolLogRow'
import {
  filterMemoryNotes,
  memoryStatusCopy,
  recentVisibleMemoryLog,
} from '../lib/memory-display'
import { colors, radius, shadows } from '../lib/theme'
import { memoryService } from '../services/memory'
import { useStore } from '../store'
import type { MemoryNoteSummary } from '../store/slices/memory'

export default function Memories() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const [expandedPath, setExpandedPath] = useState<string | null>(null)
  const [deletingPath, setDeletingPath] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const memoryNotes = useStore((s) => s.memoryNotes)
  const memoryNotesStatus = useStore((s) => s.memoryNotesStatus)
  const memoryNotesError = useStore((s) => s.memoryNotesError)
  const lastExtractionSummary = useStore((s) => s.lastExtractionSummary)
  const memoryActivityLog = useStore((s) => s.memoryActivityLog)
  const recentMemoryLog = useMemo(() => recentVisibleMemoryLog(memoryActivityLog), [memoryActivityLog])
  const filteredNotes = useMemo(
    () => filterMemoryNotes(memoryNotes, searchQuery),
    [memoryNotes, searchQuery],
  )
  const loading = memoryNotesStatus === 'loading'

  useEffect(() => {
    void memoryService.listMemories()
  }, [])

  const handleRefresh = useCallback(() => {
    void memoryService.listMemories()
  }, [])

  const handleTidy = useCallback(() => {
    void memoryService.consolidateMemories()
  }, [])

  const handleImport = useCallback(() => {
    if (importing || loading) return

    setImporting(true)
    void (async () => {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: [
          'application/pdf',
          'text/*',
          'text/markdown',
          'application/json',
          'application/xml',
          'application/yaml',
          'application/x-yaml',
        ],
      })
      if (result.canceled) return

      const asset = result.assets[0]
      if (asset === undefined) return

      const imported = await memoryService.importDocument({
        uri: asset.uri,
        name: asset.name,
        ...(asset.mimeType === undefined ? {} : { mimeType: asset.mimeType }),
        ...(asset.size === undefined ? {} : { size: asset.size }),
      })
      if (imported === null) return
      Alert.alert(
        'Imported document',
        `${imported.title}\n\n${imported.noteCount} searchable chunk${imported.noteCount === 1 ? '' : 's'} added to Jeff's brain.`,
      )
    })().finally(() => setImporting(false))
  }, [importing, loading])

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
        <HeaderButton
          label={importing ? '📥 Importing' : '📥 Import'}
          onPress={handleImport}
          muted
          disabled={loading || importing}
        />
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
          onChangeText={setSearchQuery}
          placeholder="Search memories"
          placeholderTextColor={colors.text.muted}
          style={styles.searchBar}
          value={searchQuery}
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
              deleting={deletingPath === note.path}
              expanded={expandedPath === note.path}
              key={note.path}
              note={note}
              onDelete={handleDelete}
              onToggle={handleToggle}
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
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
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
})
