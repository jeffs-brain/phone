import type { Slice } from '../types'

export type RecallHit = { id: string; score: number; text: string; source: string }

export type ToolLogEntry = {
  id: string
  ts: number
  tool: string
  status: 'pending' | 'running' | 'done' | 'error'
  detail?: string
}

export type MemorySlice = {
  preContextHits: RecallHit[]
  toolLog: ToolLogEntry[]
  lastExtractionSummary: string | null
  recentRecall: RecallHit[]
  setPreContext: (hits: RecallHit[]) => void
  appendToolLog: (entry: ToolLogEntry) => void
  setLastExtraction: (summary: string) => void
  setRecentRecall: (hits: RecallHit[]) => void
  clearTurn: () => void
}

export const createMemorySlice: Slice<MemorySlice> = (set) => ({
  preContextHits: [],
  toolLog: [],
  lastExtractionSummary: null,
  recentRecall: [],

  setPreContext: (preContextHits) => set({ preContextHits }, false, 'memory/setPreContext'),
  appendToolLog: (entry) =>
    set((s) => ({ toolLog: [...s.toolLog, entry].slice(-200) }), false, 'memory/appendToolLog'),
  setLastExtraction: (lastExtractionSummary) => set({ lastExtractionSummary }, false, 'memory/setLastExtraction'),
  setRecentRecall: (recentRecall) => set({ recentRecall }, false, 'memory/setRecentRecall'),
  clearTurn: () => set({ preContextHits: [], toolLog: [] }, false, 'memory/clearTurn'),
})
