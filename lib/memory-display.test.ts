import { describe, expect, it } from 'bun:test'

import type { MemoryNoteSummary, ToolLogEntry } from '../store/slices/memory'
import {
  cleanMemoryText,
  filterMemoryNotes,
  memoryStatusCopy,
  recentVisibleMemoryLog,
} from './memory-display'

const note = (overrides: Partial<MemoryNoteSummary>): MemoryNoteSummary => ({
  path: 'memory/global/note.md',
  name: 'Default note',
  description: '',
  content: '',
  created: '2026-04-25T12:00:00.000Z',
  modified: '2026-04-25T12:00:00.000Z',
  type: 'user',
  tags: [],
  ...overrides,
})

const log = (overrides: Partial<ToolLogEntry>): ToolLogEntry => ({
  id: `log-${overrides.ts ?? 0}`,
  ts: overrides.ts ?? 0,
  tool: 'memory_list',
  status: 'done',
  ...overrides,
})

describe('memory display helpers', () => {
  it('formats empty and populated memory states', () => {
    expect(memoryStatusCopy('idle', 0)).toEqual('No durable memories stored yet')
    expect(memoryStatusCopy('ready', 1)).toEqual('1 stored memory')
    expect(memoryStatusCopy('ready', 2)).toEqual('2 stored memories')
  })

  it('cleans optional memory text safely', () => {
    expect(cleanMemoryText(undefined)).toEqual('')
    expect(cleanMemoryText('  useful memory  ')).toEqual('useful memory')
  })

  it('filters notes by name, preview, description, and tags', () => {
    const notes = [
      note({ name: 'Favourite food', preview: 'Octopus and chilli oil' }),
      note({ name: 'Project', description: 'Berlin hack demo' }),
      note({ name: 'Family', tags: ['family', 'kids'] }),
    ]

    expect(filterMemoryNotes(notes, 'octopus').map((item) => item.name)).toEqual(['Favourite food'])
    expect(filterMemoryNotes(notes, 'berlin').map((item) => item.name)).toEqual(['Project'])
    expect(filterMemoryNotes(notes, 'kids').map((item) => item.name)).toEqual(['Family'])
    expect(filterMemoryNotes(notes, ' ').map((item) => item.name)).toEqual([
      'Favourite food',
      'Project',
      'Family',
    ])
  })

  it('hides stale running log entries once a matching terminal entry exists', () => {
    const entries = [
      log({ id: 'running', ts: 1, tool: 'memory_import', status: 'running', detail: 'doc.pdf' }),
      log({ id: 'done', ts: 2, tool: 'memory_import', status: 'done', detail: 'doc.pdf' }),
      log({ id: 'list', ts: 3, tool: 'memory_list', status: 'done', detail: '1 note' }),
    ]

    expect(recentVisibleMemoryLog(entries).map((entry) => entry.id)).toEqual(['list', 'done'])
  })
})
