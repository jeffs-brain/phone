import {
  createExpoFileAdapter,
  createHashEmbedder,
  createMemoryClient,
  createMobileStore,
  createOpSqliteOpenDb,
  createRetrieval,
  createSearchIndex,
  resolveExpoDocumentDirectory,
  type MemoryClient,
  type RecallHit as SdkRecallHit,
  type Scope,
} from '@jeffs-brain/memory-react-native'

import { BRAIN_ID, MEMORY_PRECONTEXT } from '../lib/constants'
import { createId } from '../lib/id'
import { storeApi } from '../store'
import type { RecallHit } from '../store/slices/memory'

const MEMORY_ACTOR_ID = 'alex-jay'
const DEFAULT_SCOPE: Scope = 'global'
const HASH_EMBEDDING_DIM = 384

let memoryClient: MemoryClient | null = null
let memoryClientInFlight: Promise<MemoryClient> | null = null

const cleanFilenamePart = (text: string): string => {
  const cleaned = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return cleaned === '' ? 'note' : cleaned
}

const noteTitle = (text: string): string => {
  const firstSentence = text.split(/[.!?\n]/)[0]?.trim() ?? ''
  if (firstSentence === '') return 'Remembered note'
  return firstSentence.length <= 72 ? firstSentence : `${firstSentence.slice(0, 69)}...`
}

const explicitMemoryText = (text: string): string | null => {
  const trimmed = text.trim()
  const match = /^(?:please\s+)?(?:remember|make\s+a\s+note\s+that|note\s+that)\s+(.+)$/is.exec(trimmed)
  if (match === null) return null
  const memory = match[1]?.trim() ?? ''
  return memory === '' ? null : memory
}

const toRecallHit = (hit: SdkRecallHit): RecallHit => {
  const text = hit.note.indexEntry?.trim() || hit.note.content.trim() || hit.content.trim()
  return {
    id: String(hit.path),
    score: hit.score,
    source: hit.note.name,
    text,
  }
}

const appendMemoryLog = (
  tool: string,
  status: 'pending' | 'running' | 'done' | 'error',
  detail?: string,
): void => {
  storeApi.get().appendToolLog({
    id: createId('memory-log'),
    ts: Date.now(),
    tool,
    status,
    ...(detail === undefined ? {} : { detail }),
  })
}

const createClient = async (): Promise<MemoryClient> => {
  const fileAdapter = await createExpoFileAdapter()
  const root = fileAdapter.join(await resolveExpoDocumentDirectory(), `brains/${BRAIN_ID}`)
  const store = await createMobileStore({ root, adapter: fileAdapter })
  const embedder = createHashEmbedder({ dim: HASH_EMBEDDING_DIM })
  const searchIndex = await createSearchIndex({
    dbPath: fileAdapter.join(root, '.search.db'),
    openDb: createOpSqliteOpenDb(),
    vectorDim: embedder.dimension(),
  })
  const retrieval = createRetrieval({ index: searchIndex, embedder })
  const client = createMemoryClient({
    brainId: BRAIN_ID,
    store,
    searchIndex,
    retrieval,
    embedder,
    defaultActorId: MEMORY_ACTOR_ID,
    defaultScope: DEFAULT_SCOPE,
  })
  await client.rebuildIndex().catch(() => undefined)
  return client
}

const getMemoryClient = async (): Promise<MemoryClient> => {
  if (memoryClient !== null) return memoryClient
  if (memoryClientInFlight !== null) return memoryClientInFlight

  const promise = createClient()
  memoryClientInFlight = promise
  try {
    memoryClient = await promise
    return memoryClient
  } finally {
    if (memoryClientInFlight === promise) memoryClientInFlight = null
  }
}

export const memoryService = {
  async recallPreContext(query: string): Promise<RecallHit[]> {
    const trimmed = query.trim()
    if (trimmed === '') {
      storeApi.get().setPreContext([])
      return []
    }

    try {
      const client = await getMemoryClient()
      const hits = (await client.recall({
        query: trimmed,
        topK: MEMORY_PRECONTEXT.TOP_K,
        scope: DEFAULT_SCOPE,
        actorId: MEMORY_ACTOR_ID,
      })).map(toRecallHit)
      storeApi.get().setPreContext(hits)
      return hits
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      storeApi.get().setPreContext([])
      appendMemoryLog('memory_recall', 'error', detail)
      return []
    }
  },

  async rememberExplicitInstruction(text: string): Promise<boolean> {
    const memory = explicitMemoryText(text)
    if (memory === null) return false

    appendMemoryLog('memory_remember', 'running', noteTitle(memory))
    try {
      const client = await getMemoryClient()
      const note = await client.remember({
        filename: `${new Date().toISOString().slice(0, 10)}-${cleanFilenamePart(memory)}.md`,
        name: noteTitle(memory),
        description: memory,
        content: memory,
        indexEntry: memory,
        scope: DEFAULT_SCOPE,
        actorId: MEMORY_ACTOR_ID,
        tags: ['explicit', 'chat'],
      })
      storeApi.get().setLastExtraction(`Remembered: ${note.name}`)
      appendMemoryLog('memory_remember', 'done', note.name)
      return true
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      storeApi.get().setLastExtraction(`Memory save failed: ${detail}`)
      appendMemoryLog('memory_remember', 'error', detail)
      return false
    }
  },
}
