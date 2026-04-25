import {
  initLlama,
  type CompletionParams,
  type LlamaContext,
  type NativeCompletionResult,
  type RNLlamaMessagePart,
  type RNLlamaOAICompatibleMessage,
  type TokenData,
} from 'llama.rn'

import { GEMMA_STOPS, INFERENCE_CONFIG, MEMORY_PRECONTEXT, STREAMING, SYSTEM_PROMPT } from '../lib/constants'
import { storeApi } from '../store'
import type { ModelId } from '../store/slices/inference'
import type { ContentPart, Message, ProviderId } from '../store/types'
import { memoryService } from './memory'
import { ensureModelFile, ensureProjectorFile } from './model-assets'
import { clearRuntimeMarker, writeRuntimeMarker } from './runtime-marker'

type LoadedContext = {
  readonly id: ModelId
  readonly context: LlamaContext
  readonly multimodalReady: boolean
}

type GenerateOptions = {
  readonly messageId: string
  readonly provider: ProviderId
  readonly signal: AbortSignal
}

type StreamState = {
  readonly messageId: string
  contentBuffer: string
  thinkingBuffer: string
  frameHandle: number | null
  emittedContent: string
  emittedThinking: string
}

type LoadInFlight = {
  readonly id: ModelId
  readonly promise: Promise<void>
}

type CompletionRequest = Awaited<ReturnType<LlamaContext['parallel']['completion']>>

let loaded: LoadedContext | null = null
let loadInFlight: LoadInFlight | null = null
let multimodalInFlight: Promise<void> | null = null
let activeCompletion: CompletionRequest | null = null
const streams = new Map<string, StreamState>()
const SIMULATOR_VISION_DISABLED_MESSAGE = [
  'I can attach and preview that image, but this simulator profile is running text-only Gemma.',
  'Remove EXPO_PUBLIC_SIMULATOR_VISION=disabled to run the local vision projector in iOS Simulator.',
].join(' ')

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

const appendBuffered = (messageId: string, chunk: string): void => {
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

const finishStream = (messageId: string): void => {
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

const textFromParts = (parts: readonly ContentPart[]): string =>
  parts
    .filter((part): part is Extract<ContentPart, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('\n')

const mediaPlaceholder = (parts: readonly ContentPart[]): string | null => {
  const hasImage = parts.some((part) => part.type === 'image')
  const hasAudio = parts.some((part) => part.type === 'audio')
  if (!hasImage && !hasAudio) return null
  if (hasImage && hasAudio) return '[Image and audio attachments omitted on this simulator profile.]'
  if (hasImage) return '[Image attachment omitted on this simulator profile.]'
  return '[Audio attachment omitted on this simulator profile.]'
}

const toLlamaContent = (
  parts: readonly ContentPart[],
  includeMedia: boolean,
): string | RNLlamaMessagePart[] => {
  if (!includeMedia) {
    return [textFromParts(parts).trim(), mediaPlaceholder(parts)]
      .filter((part): part is string => part !== null && part !== '')
      .join('\n\n')
  }

  const mediaParts = parts
    .filter((part): part is Extract<ContentPart, { type: 'image' | 'audio' }> =>
      part.type === 'image' || part.type === 'audio',
    )
    .map((part): RNLlamaMessagePart =>
      part.type === 'image'
        ? { type: 'image_url', image_url: { url: part.uri } }
        : { type: 'input_audio', input_audio: { url: part.uri, format: 'wav' } },
    )

  if (mediaParts.length === 0) return textFromParts(parts)

  const text = textFromParts(parts)
  return [
    ...(text.trim() === '' ? [] : [{ type: 'text' as const, text }]),
    ...mediaParts,
  ]
}

const toLlamaMessage = (
  message: Message,
  includeMediaForMessage: boolean,
): RNLlamaOAICompatibleMessage | null => {
  if (message.role === 'tool') return null
  const reasoningContent = message.thinking?.text
  return {
    role: message.role,
    content: toLlamaContent(message.parts, includeMediaForMessage),
    ...(reasoningContent === undefined || reasoningContent === '' ? {} : { reasoning_content: reasoningContent }),
  }
}

const isMediaPart = (part: ContentPart): part is Extract<ContentPart, { type: 'image' | 'audio' }> =>
  part.type === 'image' || part.type === 'audio'

const messageRequiresMultimodal = (message: Message): boolean => message.parts.some(isMediaPart)

const currentContextRequiresMultimodal = (): boolean => storeApi.get().messages.some(messageRequiresMultimodal)

const latestUserRequiresMultimodal = (): boolean => {
  const messages = storeApi.get().messages
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role === 'user') return messageRequiresMultimodal(message)
  }
  return false
}

const latestUserMediaMessageId = (): string | null => {
  const messages = storeApi.get().messages
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role !== 'user') continue
    return messageRequiresMultimodal(message) ? message.id : null
  }
  return null
}

const latestUserText = (): string => {
  const messages = storeApi.get().messages
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role === 'user') return textFromParts(message.parts)
  }
  return ''
}

const setAssetProgress = (stage: 'checking' | 'available' | 'downloading' | 'verifying' | 'downloaded', bytes: {
  readonly received: number
  readonly total: number
}): void => {
  const state = storeApi.get()
  if (stage === 'checking') {
    state._setModelStatus('checking')
  } else if (stage === 'verifying') {
    state._setModelStatus('verifying')
  } else if (stage === 'downloading') {
    state._setModelStatus('downloading')
  } else if (stage === 'available' || stage === 'downloaded') {
    state._setModelStatus('loaded')
  }

  state._setDownloadBytes(bytes)
}

const buildSystemPrompt = (): string => {
  const hits = storeApi.get().preContextHits.slice(0, MEMORY_PRECONTEXT.TOP_K)
  if (hits.length === 0) return SYSTEM_PROMPT

  const memoryBlock = hits
    .map((hit, index) => `${index + 1}. ${hit.text.slice(0, MEMORY_PRECONTEXT.SNIPPET_MAX_CHARS)}`)
    .join('\n')

  return `${SYSTEM_PROMPT}\n\nRelevant memories:\n${memoryBlock}`
}

const buildMessages = (activeAssistantId: string, includeMedia: boolean): RNLlamaOAICompatibleMessage[] => {
  const mediaMessageId = includeMedia ? latestUserMediaMessageId() : null
  const historical = storeApi
    .get()
    .messages
    .filter((message) => message.id !== activeAssistantId)
    .map((message) => toLlamaMessage(message, message.id === mediaMessageId))
    .filter((message): message is RNLlamaOAICompatibleMessage => message !== null)

  return [{ role: 'system', content: buildSystemPrompt() }, ...historical]
}

const buildCompletionParams = (messageId: string, includeMedia: boolean): CompletionParams => {
  const enableThinking = !includeMedia
  return {
    messages: buildMessages(messageId, includeMedia),
    n_threads: INFERENCE_CONFIG.N_THREADS,
    n_predict: INFERENCE_CONFIG.N_PREDICT_MAX,
    stop: [...GEMMA_STOPS],
    jinja: true,
    enable_thinking: enableThinking,
    reasoning_format: enableThinking ? 'auto' : 'none',
    ...(enableThinking
      ? {
          thinking_budget_tokens: INFERENCE_CONFIG.THINKING_BUDGET_TOKENS,
          thinking_budget_message: INFERENCE_CONFIG.THINKING_BUDGET_MESSAGE,
        }
      : {}),
    parallel_tool_calls: false as unknown as object,
  }
}

type TokenStreamActivity = 'content' | 'thinking' | 'none'

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

const appendTokenData = (messageId: string, token: TokenData): TokenStreamActivity => {
  const state = streamState(messageId)

  const content = appendCumulativeDelta(state.emittedContent, token.content, (chunk) => {
    appendBuffered(messageId, chunk)
  })
  state.emittedContent = content.emitted

  const thinking = appendCumulativeDelta(state.emittedThinking, token.reasoning_content, (chunk) => {
    appendThinkingBuffered(messageId, chunk)
  })
  state.emittedThinking = thinking.emitted

  if (content.changed || state.emittedContent !== '') return 'content'
  if (thinking.changed) return 'thinking'
  return 'none'
}

const stopActiveCompletion = async (): Promise<void> => {
  const request = activeCompletion
  if (request === null) return
  activeCompletion = null
  await request.stop().catch(() => undefined)
}

const releaseLoadedContext = async (): Promise<void> => {
  await stopActiveCompletion()
  if (loaded === null) return
  const context = loaded.context
  loaded = null
  multimodalInFlight = null
  await context.parallel.disable().catch(() => undefined)
  await context.releaseMultimodal().catch(() => undefined)
  await context.release()
}

const ensureMultimodalReady = async (): Promise<void> => {
  const current = loaded
  if (current === null) throw new Error('Local Gemma is not loaded.')
  if (current.multimodalReady) return
  if (multimodalInFlight !== null) return multimodalInFlight

  const promise = (async () => {
    const assets = await ensureProjectorFile(current.id, (progress) => {
      setAssetProgress(progress.stage, {
        received: progress.bytesReceived,
        total: progress.bytesExpected,
      })
    })

    if (loaded?.context !== current.context) {
      throw new Error('Local Gemma changed while the projector was loading.')
    }

    storeApi.get()._setModelStatus('initialised')
    await writeRuntimeMarker({ modelId: current.id, stage: 'projector-load' })
    const multimodalReady = await current.context.initMultimodal({
      path: assets.projectorPath,
      use_gpu: INFERENCE_CONFIG.MULTIMODAL_USE_GPU && current.context.gpu,
      image_max_tokens: INFERENCE_CONFIG.IMAGE_MAX_TOKENS,
    })
    if (!multimodalReady) {
      throw new Error('Gemma multimodal projector failed to initialise.')
    }

    loaded = { ...current, multimodalReady: true }
    await clearRuntimeMarker()
    storeApi.get()._setModelStatus('ready')
  })().catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    const state = storeApi.get()
    state._setModelError(message)
    state._setModelStatus('error')
    return clearRuntimeMarker().then(() => {
      throw error
    })
  })

  multimodalInFlight = promise
  void promise.finally(() => {
    if (multimodalInFlight === promise) multimodalInFlight = null
  }).catch(() => undefined)
  return promise
}

const generationModelId = (preferred: ModelId, includeMedia: boolean): ModelId => {
  if (includeMedia && INFERENCE_CONFIG.PROFILE === 'simulator') return 'gemma-4-E2B'
  return preferred
}

const generateWithLoadedContext = async (
  messageId: string,
  signal: AbortSignal,
  includeMedia: boolean,
): Promise<NativeCompletionResult> => {
  if (loaded === null) throw new Error('Local Gemma is not loaded.')

  if (includeMedia) {
    storeApi.get()._setGenerationStatus('preparing-vision')
    await ensureMultimodalReady()
  }

  if (loaded === null) throw new Error('Local Gemma is not loaded.')
  await writeRuntimeMarker({ modelId: loaded.id, stage: 'generation' })
  const request = await loaded.context.parallel
    .completion(
      buildCompletionParams(messageId, includeMedia),
      (_requestId, token) => {
        const activity = appendTokenData(messageId, token)
        if (activity === 'thinking') {
          storeApi.get()._setGenerationStatus('thinking')
        } else if (activity === 'content') {
          storeApi.get()._setGenerationStatus('streaming')
        }
      },
    )
    .catch((error) => clearRuntimeMarker().then(() => {
      throw error
    }))

  const abort = (): void => {
    void request.stop()
  }
  signal.addEventListener('abort', abort, { once: true })
  activeCompletion = request

  try {
    return await request.promise
  } finally {
    if (activeCompletion === request) activeCompletion = null
    signal.removeEventListener('abort', abort)
    await clearRuntimeMarker()
  }
}

const loadModelInternal = async (id: ModelId): Promise<void> => {
  if (loaded?.id === id) return

  const state = storeApi.get()
  state._setModelId(id)
  state._setModelStatus('checking')
  state._setModelError(null)
  state._setDownloadBytes(null)

  try {
    const assets = await ensureModelFile(id, (progress) => {
      setAssetProgress(progress.stage, {
        received: progress.bytesReceived,
        total: progress.bytesExpected,
      })
    })

    state._setModelStatus('loaded')
    await releaseLoadedContext()

    state._setModelStatus('initialised')
    await writeRuntimeMarker({ modelId: id, stage: 'model-load' })
    const context = await initLlama({
      model: assets.modelPath,
      n_ctx: INFERENCE_CONFIG.N_CTX,
      n_batch: INFERENCE_CONFIG.N_BATCH,
      n_ubatch: INFERENCE_CONFIG.N_UBATCH,
      n_threads: INFERENCE_CONFIG.N_THREADS,
      n_gpu_layers: INFERENCE_CONFIG.N_GPU_LAYERS,
      n_parallel: INFERENCE_CONFIG.N_PARALLEL,
      ctx_shift: INFERENCE_CONFIG.CTX_SHIFT,
      flash_attn_type: INFERENCE_CONFIG.FLASH_ATTN_TYPE,
      use_mlock: false,
    })

    const parallelReady = await context.parallel.enable({
      n_parallel: INFERENCE_CONFIG.N_PARALLEL,
      n_batch: INFERENCE_CONFIG.N_BATCH,
    })
    if (!parallelReady) {
      await context.release()
      throw new Error('llama.rn parallel queue failed to initialise.')
    }

    loaded = { id, context, multimodalReady: false }
    await clearRuntimeMarker()
    state._setDownloadBytes(null)
    state._setModelStatus('ready')
  } catch (error) {
    await clearRuntimeMarker()
    const message = error instanceof Error ? error.message : String(error)
    state._setModelError(message)
    state._setModelStatus('error')
    throw error
  }
}

const loadModelOnce = async (id: ModelId): Promise<void> => {
  if (loaded?.id === id) return
  if (loadInFlight?.id === id) return loadInFlight.promise
  if (loadInFlight !== null) await loadInFlight.promise.catch(() => undefined)

  const promise = loadModelInternal(id)
  loadInFlight = { id, promise }
  void promise.finally(() => {
    if (loadInFlight?.promise === promise) loadInFlight = null
  }).catch(() => undefined)
  return promise
}

export const inferenceService = {
  async loadModel(id: ModelId): Promise<void> {
    await loadModelOnce(id)
  },

  async unloadModel(): Promise<void> {
    await releaseLoadedContext()
    const state = storeApi.get()
    state._setModelId(null)
    state._setModelError(null)
    state._setDownloadBytes(null)
    state._setModelStatus('unloaded')
  },

  async generate(opts: GenerateOptions): Promise<void> {
    const state = storeApi.get()
    state._setGenerationStatus('loading-first-token')
    state.clearTurn()

    try {
      const userText = latestUserText()
      await memoryService.rememberExplicitInstruction(userText)
      await memoryService.recallPreContext(userText)

      if (opts.provider !== 'gemma-local') {
        appendBuffered(
          opts.messageId,
          'That provider is not installed in this build yet, so I am answering with local Gemma.',
        )
      }

      const turnRequiresMedia = latestUserRequiresMultimodal()
      const includeMedia = INFERENCE_CONFIG.MULTIMODAL_GENERATION_ENABLED && turnRequiresMedia
      if (turnRequiresMedia && !includeMedia) {
        appendBuffered(opts.messageId, SIMULATOR_VISION_DISABLED_MESSAGE)
        finishStream(opts.messageId)
        state.commitStreamingMessage(opts.messageId)
        state._setGenerationStatus('done')
        return
      }

      const targetModel = generationModelId(storeApi.get().modelSize, includeMedia)
      if (targetModel !== storeApi.get().modelSize) {
        storeApi.get().setModelSize(targetModel)
      }
      if (loaded?.id !== targetModel) {
        await this.loadModel(targetModel)
      }

      const result = await generateWithLoadedContext(opts.messageId, opts.signal, includeMedia)
      finishStream(opts.messageId)
      state.commitStreamingMessage(opts.messageId, {
        content: result.content,
        thinking: result.reasoning_content,
      })
      state._setGenerationStatus('done')
    } catch (error) {
      finishStream(opts.messageId)
      if (opts.signal.aborted) {
        state.commitStreamingMessage(opts.messageId)
        state._setGenerationStatus('idle')
        return
      }

      const message = error instanceof Error ? error.message : String(error)
      appendBuffered(opts.messageId, `Local inference failed: ${message}`)
      finishStream(opts.messageId)
      state.commitStreamingMessage(opts.messageId)
      state._setGenerationStatus('error')
    }
  },
}
