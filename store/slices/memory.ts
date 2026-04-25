import type { Slice } from '../types'

export type RecallHit = { id: string; score: number; text: string; source: string }

export type MemoryNoteSummary = {
  path: string
  name: string
  description: string
  content: string
  created: string
  modified: string
  type: string
  tags: string[]
  indexEntry?: string
  preview?: string
}

export type MemoryNotesStatus = 'idle' | 'loading' | 'ready' | 'error'

export type ToolLogEntry = {
  id: string
  ts: number
  tool: string
  status: 'pending' | 'running' | 'done' | 'error'
  detail?: string
}

export type MemorySlice = {
  preContextHits: RecallHit[]
  memoryNotes: MemoryNoteSummary[]
  memoryNotesStatus: MemoryNotesStatus
  memoryNotesError: string | null
  toolLog: ToolLogEntry[]
  lastExtractionSummary: string | null
  recentRecall: RecallHit[]
  setPreContext: (hits: RecallHit[]) => void
  setMemoryNotes: (notes: MemoryNoteSummary[]) => void
  setMemoryNotesStatus: (status: MemoryNotesStatus) => void
  setMemoryNotesError: (error: string | null) => void
  appendToolLog: (entry: ToolLogEntry) => void
  setLastExtraction: (summary: string) => void
  setRecentRecall: (hits: RecallHit[]) => void
  clearTurn: () => void
}

export const createMemorySlice: Slice<MemorySlice> = (set) => ({
  preContextHits: [],
  memoryNotes: [],
  memoryNotesStatus: 'idle',
  memoryNotesError: null,
  toolLog: [],
  lastExtractionSummary: null,
  recentRecall: [],

  setPreContext: (preContextHits) => set({ preContextHits }, false, 'memory/setPreContext'),
  setMemoryNotes: (memoryNotes) => set({ memoryNotes }, false, 'memory/setMemoryNotes'),
  setMemoryNotesStatus: (memoryNotesStatus) =>
    set({ memoryNotesStatus }, false, 'memory/setMemoryNotesStatus'),
  setMemoryNotesError: (memoryNotesError) =>
    set({ memoryNotesError }, false, 'memory/setMemoryNotesError'),
  appendToolLog: (entry) =>
    set((s) => ({ toolLog: [...s.toolLog, entry].slice(-200) }), false, 'memory/appendToolLog'),
  setLastExtraction: (lastExtractionSummary) => set({ lastExtractionSummary }, false, 'memory/setLastExtraction'),
  setRecentRecall: (recentRecall) => set({ recentRecall }, false, 'memory/setRecentRecall'),
  clearTurn: () => set({ preContextHits: [], toolLog: [] }, false, 'memory/clearTurn'),
})
