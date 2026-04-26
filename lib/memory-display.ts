import type { MemoryNoteSummary, ToolLogEntry } from '../store/slices/memory'

export const formatMemoryDate = (value: string): string => {
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

export const formatRelativeDate = (value: string): string => {
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

export const formatLogTime = (value: number): string =>
  new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

export const memoryStatusCopy = (status: string, count: number): string => {
  if (status === 'loading') return count === 0 ? 'Loading memories' : 'Refreshing memories'
  if (count === 0) return 'No durable memories stored yet'
  return `${count} stored memor${count === 1 ? 'y' : 'ies'}`
}

export const cleanMemoryText = (value: string | undefined): string => value?.trim() ?? ''

export const memoryTypeLabel = (type: string): string => {
  if (type === 'reference') return 'Reference chunk'
  if (type === 'feedback') return 'Feedback'
  if (type === 'project') return 'Project note'
  if (type === 'reflection') return 'Reflection'
  return 'Memory note'
}

const isOpenLogEntry = (entry: ToolLogEntry): boolean =>
  entry.status === 'pending' || entry.status === 'running'

export const recentVisibleMemoryLog = (entries: readonly ToolLogEntry[]): ToolLogEntry[] => {
  const recent = entries.slice(-24)
  const visible = recent.filter((entry, index) => {
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

export const filterMemoryNotes = (
  notes: readonly MemoryNoteSummary[],
  rawQuery: string,
): readonly MemoryNoteSummary[] => {
  const query = rawQuery.trim().toLowerCase()
  if (query === '') return notes
  return notes.filter((note) =>
    note.path.toLowerCase().includes(query) ||
    note.name.toLowerCase().includes(query) ||
    note.preview?.toLowerCase().includes(query) ||
    note.description?.toLowerCase().includes(query) ||
    note.indexEntry?.toLowerCase().includes(query) ||
    note.content.toLowerCase().includes(query) ||
    note.tags.join(' ').toLowerCase().includes(query),
  )
}
