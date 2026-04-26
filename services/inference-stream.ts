import type { TokenData } from 'llama.rn'

import { STREAMING } from '../lib/constants'
import { sanitiseModelResponse } from '../lib/chat/response-sanitizer'
import { storeApi } from '../store'

export type TokenStreamActivity = 'content' | 'thinking' | 'none'

type StreamState = {
  readonly messageId: string
  contentBuffer: string
  thinkingBuffer: string
  frameHandle: number | null
  rawContent: string
  rawThinking: string
  emittedContent: string
  emittedThinking: string
}

const streams = new Map<string, StreamState>()

const scheduleFrame = (callback: () => void): number => {
  if (typeof requestAnimationFrame === 'function') {
    return requestAnimationFrame(() => callback())
  }
  return setTimeout(callback, 16) as unknown as number
}

const cancelFrame = (handle: number): void => {
  if (typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(handle)
    return
  }
  clearTimeout(handle)
}

const streamState = (messageId: string): StreamState => {
  const existing = streams.get(messageId)
  if (existing !== undefined) return existing

  const next: StreamState = {
    messageId,
    contentBuffer: '',
    thinkingBuffer: '',
    frameHandle: null,
    rawContent: '',
    rawThinking: '',
    emittedContent: '',
    emittedThinking: '',
  }
  streams.set(messageId, next)
  return next
}

const hasBufferedStream = (state: StreamState): boolean =>
  state.contentBuffer !== '' || state.thinkingBuffer !== ''

const flushStreamChunk = (state: StreamState): void => {
  if (state.thinkingBuffer !== '') {
    const chunk = state.thinkingBuffer.slice(0, STREAMING.MAX_CHUNK_PER_FLUSH)
    state.thinkingBuffer = state.thinkingBuffer.slice(chunk.length)
    storeApi.get().appendThinkingChunk(state.messageId, chunk)
  }

  if (state.contentBuffer !== '') {
    const chunk = state.contentBuffer.slice(0, STREAMING.MAX_CHUNK_PER_FLUSH)
    state.contentBuffer = state.contentBuffer.slice(chunk.length)
    storeApi.get().appendStreamingChunk(state.messageId, chunk)
  }
}

const flushStream = (messageId: string): void => {
  const state = streams.get(messageId)
  if (state === undefined) return

  state.frameHandle = null
  if (!hasBufferedStream(state)) return

  flushStreamChunk(state)

  if (hasBufferedStream(state)) {
    state.frameHandle = scheduleFrame(() => flushStream(messageId))
  }
}

export const appendBuffered = (messageId: string, chunk: string): void => {
  if (chunk === '') return
  const state = streamState(messageId)
  state.contentBuffer += chunk
  if (state.frameHandle === null) {
    state.frameHandle = scheduleFrame(() => flushStream(messageId))
  }
}

const appendThinkingBuffered = (messageId: string, chunk: string): void => {
  if (chunk === '') return
  const state = streamState(messageId)
  state.thinkingBuffer += chunk
  if (state.frameHandle === null) {
    state.frameHandle = scheduleFrame(() => flushStream(messageId))
  }
}

export const finishStream = (messageId: string): void => {
  const state = streams.get(messageId)
  if (state === undefined) return
  if (state.frameHandle !== null) cancelFrame(state.frameHandle)
  state.frameHandle = null
  while (hasBufferedStream(state)) {
    flushStreamChunk(state)
  }
  storeApi.get().markThinkingDone(messageId)
  streams.delete(messageId)
}

const appendCumulativeDelta = (
  previous: string,
  next: string | undefined,
  append: (chunk: string) => void,
): { emitted: string; changed: boolean } => {
  if (next === undefined || next === previous) {
    return { emitted: previous, changed: false }
  }

  if (!next.startsWith(previous)) {
    return { emitted: next, changed: false }
  }

  const delta = next.slice(previous.length)
  append(delta)
  return { emitted: next, changed: delta !== '' }
}

export const appendTokenData = (messageId: string, token: TokenData): TokenStreamActivity => {
  const state = streamState(messageId)

  if (typeof token.content === 'string') state.rawContent = token.content
  if (typeof token.reasoning_content === 'string') state.rawThinking = token.reasoning_content

  const sanitised = sanitiseModelResponse(state.rawContent, state.rawThinking)
  const thinkingEnabled = storeApi.get().thinkingEnabled

  const content = appendCumulativeDelta(state.emittedContent, sanitised.content, (chunk) => {
    appendBuffered(messageId, chunk)
  })
  state.emittedContent = content.emitted

  const thinking = appendCumulativeDelta(state.emittedThinking, thinkingEnabled ? sanitised.thinking : '', (chunk) => {
    appendThinkingBuffered(messageId, chunk)
  })
  state.emittedThinking = thinking.emitted

  if (content.changed || state.emittedContent !== '') return 'content'
  if (thinking.changed) return 'thinking'
  return 'none'
}
