import {
  initLlama,
  type CompletionParams,
  type LlamaContext,
  type NativeCompletionResult,
  type RNLlamaMessagePart,
  type RNLlamaOAICompatibleMessage,
  type TokenData,
  type ToolCall as LlamaToolCall,
} from 'llama.rn'
import type {
  ContentBlock as SdkContentBlock,
  Message as SdkMessage,
  StructuredRequest as SdkStructuredRequest,
} from '@jeffs-brain/memory-react-native'

import { GEMMA_STOPS, INFERENCE_CONFIG, MEMORY_PRECONTEXT, STREAMING, SYSTEM_PROMPT, TOOL_LIMITS } from '../lib/constants'
import { createId } from '../lib/id'
import { storeApi } from '../store'
import type { ModelId } from '../store/slices/inference'
import type { ContentPart, Message, ProviderId } from '../store/types'
import { MEMORY_TOOL_DEFINITIONS, memoryService } from './memory'
import { ensureModelFile, ensureProjectorFile } from './model-assets'
import { clearRuntimeMarker, isSimulatorMultimodalGpuAutoDisabled, writeRuntimeMarker } from './runtime-marker'

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
type CompletionTokenHandler = NonNullable<Parameters<LlamaContext['parallel']['completion']>[1]>

type LlamaAssistantToolCallMessage = RNLlamaOAICompatibleMessage & {
  readonly role: 'assistant'
  readonly tool_calls: readonly LlamaToolCallWithId[]
}

type LlamaToolResultMessage = RNLlamaOAICompatibleMessage & {
  readonly role: 'tool'
  readonly tool_call_id: string
  readonly name?: string
  readonly content: string
}

type LlamaToolCallWithId = LlamaToolCall & {
  readonly id: string
}

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

const buildCompletionParams = (
  messageId: string,
  includeMedia: boolean,
  messages = buildMessages(messageId, includeMedia),
  enableTools = !includeMedia,
): CompletionParams => {
  const enableThinking = !includeMedia
  return {
    messages,
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
    ...(enableTools
      ? {
          tools: MEMORY_TOOL_DEFINITIONS as unknown as object,
          tool_choice: 'auto',
        }
      : {}),
    parallel_tool_calls: false as unknown as object,
  }
}

const shouldOfferMemoryTools = (text: string): boolean => {
  const normalised = text.toLowerCase()
  return /\b(remember|memory|memories|recall|forget|forgot|what did i|what do you remember|did i tell you|list .*memories)\b/.test(normalised)
}

const shouldConsiderAutomaticMemory = (text: string): boolean => {
  const normalised = text.toLowerCase()
  return /\b(remember|keep in mind|for future|important|my name is|i am|i'm|i live|i work|my wife|my husband|my partner|my kid|my daughter|my son|i prefer|i like|i dislike|i hate|favourite|favorite|allergic|allergy|diet|birthday|address|phone number|email|project|deadline|goal|plan|preference)\b/.test(normalised)
}

const throwIfAborted = (signal: AbortSignal): void => {
  if (signal.aborted) throw new Error('Generation cancelled.')
}

const shouldExtractTurnMemory = (
  userText: string,
  assistantText: string,
  includeMedia: boolean,
): boolean =>
  storeApi.get().rememberConversation
    && !includeMedia
    && userText.trim() !== ''
    && assistantText.trim() !== ''
    && !shouldOfferMemoryTools(userText)
    && shouldConsiderAutomaticMemory(userText)

const textFromSdkBlock = (block: SdkContentBlock): string => {
  if (block.type === 'text') return block.text ?? ''
  if (block.type === 'tool_result') return block.toolResult?.content ?? ''
  return ''
}

const textFromSdkMessage = (message: SdkMessage): string =>
  message.content
    ?? message.blocks?.map(textFromSdkBlock).filter((text) => text.trim() !== '').join('\n')
    ?? ''

const toStructuredLlamaMessage = (message: SdkMessage): RNLlamaOAICompatibleMessage | null => {
  const content = textFromSdkMessage(message).trim()
  if (content === '') return null
  return {
    role: message.role,
    content,
  }
}

const structuredSystemMessages = (request: SdkStructuredRequest): RNLlamaOAICompatibleMessage[] =>
  [request.systemStatic, request.systemDynamic, request.system]
    .filter((message): message is string => typeof message === 'string' && message.trim() !== '')
    .map((content) => ({ role: 'system', content }))

const structuredJsonInstruction = (request: SdkStructuredRequest): string => {
  const schemaLabel = request.schemaName === undefined
    ? 'the JSON schema below'
    : `the "${request.schemaName}" JSON schema below`
  return [
    'Return only valid JSON.',
    'Do not use markdown fences, prose, comments, or hidden reasoning.',
    `The response must match ${schemaLabel}.`,
    request.schema,
  ].join('\n\n')
}

const memoryExtractionPolicy = (request: SdkStructuredRequest): RNLlamaOAICompatibleMessage[] => {
  if (request.taskType !== 'memory-extract') return []
  return [{
    role: 'system',
    content: [
      'Apply a strict memory policy.',
      'Return {"notes":[]} unless the conversation contains a stable fact, preference, plan, relationship, project detail, or explicit feedback that will matter in future chats.',
      'Do not create memories for greetings, casual acknowledgements, jokes, image descriptions, transient questions, or the assistant\'s own suggestions.',
      'If the user explicitly asks you to remember something, preserve the exact durable fact.',
    ].join('\n'),
  }]
}

const structuredMemoryCompletion = async (
  request: SdkStructuredRequest,
  signal?: AbortSignal,
): Promise<string> => {
  const messages = [
    ...structuredSystemMessages(request),
    ...memoryExtractionPolicy(request),
    { role: 'system', content: structuredJsonInstruction(request) },
    ...request.messages
      .map(toStructuredLlamaMessage)
      .filter((message): message is RNLlamaOAICompatibleMessage => message !== null),
  ]

  const result = await completeWithLoadedContext(
    signal ?? new AbortController().signal,
    {
      messages,
      n_threads: INFERENCE_CONFIG.N_THREADS,
      n_predict: request.maxTokens ?? 512,
      stop: [...GEMMA_STOPS],
      jinja: true,
      enable_thinking: false,
      reasoning_format: 'none',
      temperature: request.temperature ?? 0,
      force_pure_content: true,
      parallel_tool_calls: false as unknown as object,
    },
  )
  return normaliseCompletionContent(result.content)
}

const extractTurnMemory = async (
  messageId: string,
  userText: string,
  assistantText: string,
  includeMedia: boolean,
  signal: AbortSignal,
): Promise<void> => {
  if (!shouldExtractTurnMemory(userText, assistantText, includeMedia)) return
  if (signal.aborted) return
  storeApi.get()._setGenerationStatus('using-tools')
  await memoryService.extractTurn({
    sessionId: messageId,
    userText,
    assistantText,
    signal,
  })
}

const parseToolArguments = (raw: string): unknown => {
  const trimmed = raw.trim()
  if (trimmed === '') return {}
  return JSON.parse(trimmed) as unknown
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const nonEmptyString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value : null

const normaliseToolArguments = (value: unknown): string => {
  if (typeof value === 'string') return value
  if (value === undefined || value === null) return '{}'
  try {
    return JSON.stringify(value)
  } catch {
    return '{}'
  }
}

const normaliseToolCall = (call: LlamaToolCall): LlamaToolCallWithId => {
  const rawCall: unknown = call
  const record = isRecord(rawCall) ? rawCall : {}
  const rawFunction = record.function
  const fn = isRecord(rawFunction) ? rawFunction : {}

  return {
    id: nonEmptyString(record.id) ?? createId('tool'),
    type: 'function',
    function: {
      name: nonEmptyString(fn.name) ?? 'unknown_tool',
      arguments: normaliseToolArguments(fn.arguments),
    },
  }
}

const normaliseCompletionContent = (content: unknown): string =>
  typeof content === 'string' ? content : ''

const normaliseCompletionThinking = (thinking: unknown): string =>
  typeof thinking === 'string' ? thinking : ''

const completionToolCalls = (result: NativeCompletionResult): readonly LlamaToolCall[] => {
  const rawResult: unknown = result
  const record = isRecord(rawResult) ? rawResult : {}
  return Array.isArray(record.tool_calls) ? record.tool_calls as LlamaToolCall[] : []
}

const runMemoryToolCalls = async (
  messageId: string,
  toolCalls: readonly LlamaToolCallWithId[],
): Promise<readonly LlamaToolResultMessage[]> => {
  if (toolCalls.length === 0) return []

  storeApi.get()._setGenerationStatus('using-tools')
  const results: LlamaToolResultMessage[] = []

  for (const call of toolCalls) {
    const id = call.id
    const name = call.function.name
    let args: unknown = {}

    try {
      args = parseToolArguments(call.function.arguments)
      const execution = await memoryService.runTool(name, args)
      storeApi.get().appendToolCall(messageId, {
        id,
        name,
        args,
        status: 'done',
        result: execution.result,
      })
      results.push({
        role: 'tool',
        tool_call_id: id,
        name,
        content: execution.content,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      storeApi.get().appendToolCall(messageId, {
        id,
        name,
        args,
        status: 'error',
        error: message,
      })
      results.push({
        role: 'tool',
        tool_call_id: id,
        name,
        content: `${name} failed: ${message}`,
      })
    }
  }

  return results
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

const shouldUseMultimodalGpu = async (context: LlamaContext): Promise<boolean> => {
  if (!context.gpu || !INFERENCE_CONFIG.MULTIMODAL_USE_GPU) return false
  if (INFERENCE_CONFIG.PROFILE !== 'simulator') return true
  return !(await isSimulatorMultimodalGpuAutoDisabled().catch(() => false))
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
      use_gpu: await shouldUseMultimodalGpu(current.context),
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

const completeWithLoadedContext = async (
  signal: AbortSignal,
  params: CompletionParams,
  onToken?: CompletionTokenHandler,
): Promise<NativeCompletionResult> => {
  throwIfAborted(signal)
  if (loaded === null) throw new Error('Local Gemma is not loaded.')
  await writeRuntimeMarker({ modelId: loaded.id, stage: 'generation' })
  const request = await loaded.context.parallel
    .completion(params, onToken)
    .catch((error) => clearRuntimeMarker().then(() => {
      throw error
    }))

  if (signal.aborted) {
    await request.stop().catch(() => undefined)
    await clearRuntimeMarker()
    throw new Error('Generation cancelled.')
  }

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

const streamingTokenHandler = (messageId: string): CompletionTokenHandler =>
  (_requestId, token) => {
    const activity = appendTokenData(messageId, token)
    if (activity === 'thinking') {
      storeApi.get()._setGenerationStatus('thinking')
    } else if (activity === 'content') {
      storeApi.get()._setGenerationStatus('streaming')
    }
  }

const generateWithLoadedContext = async (
  messageId: string,
  signal: AbortSignal,
  includeMedia: boolean,
): Promise<NativeCompletionResult> => {
  if (loaded === null) throw new Error('Local Gemma is not loaded.')
  throwIfAborted(signal)

  if (includeMedia) {
    storeApi.get()._setGenerationStatus('preparing-vision')
    await ensureMultimodalReady()
    throwIfAborted(signal)
  }

  if (loaded === null) throw new Error('Local Gemma is not loaded.')
  return completeWithLoadedContext(
    signal,
    buildCompletionParams(messageId, includeMedia, undefined, false),
    streamingTokenHandler(messageId),
  )
}

const toolChoiceMessage = (
  content: string,
  toolCalls: readonly LlamaToolCallWithId[],
): LlamaAssistantToolCallMessage => ({
  role: 'assistant',
  content,
  tool_calls: toolCalls,
})

const generateWithMemoryTools = async (
  messageId: string,
  signal: AbortSignal,
): Promise<NativeCompletionResult> => {
  if (loaded === null) throw new Error('Local Gemma is not loaded.')
  throwIfAborted(signal)

  let messages = buildMessages(messageId, false)
  let result = await completeWithLoadedContext(
    signal,
    buildCompletionParams(messageId, false, messages, true),
    streamingTokenHandler(messageId),
  )

  for (let round = 0; round < TOOL_LIMITS.MAX_ROUNDS; round += 1) {
    throwIfAborted(signal)
    const assistantToolCalls = completionToolCalls(result).map(normaliseToolCall)
    if (assistantToolCalls.length === 0) break

    const toolResultMessages = await runMemoryToolCalls(messageId, assistantToolCalls)
    messages = [
      ...messages,
      toolChoiceMessage(normaliseCompletionContent(result.content), assistantToolCalls),
      ...toolResultMessages,
    ]

    result = await completeWithLoadedContext(
      signal,
      buildCompletionParams(messageId, false, messages, round + 1 < TOOL_LIMITS.MAX_ROUNDS),
      streamingTokenHandler(messageId),
    )
  }

  return result
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

memoryService.setStructuredProvider(structuredMemoryCompletion)

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
      throwIfAborted(opts.signal)

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
        throwIfAborted(opts.signal)
      }

      const result = !includeMedia
        ? await generateWithMemoryTools(opts.messageId, opts.signal)
        : await generateWithLoadedContext(opts.messageId, opts.signal, includeMedia)
      const content = normaliseCompletionContent(result.content)
      const thinking = normaliseCompletionThinking(result.reasoning_content)
      finishStream(opts.messageId)
      state.commitStreamingMessage(opts.messageId, {
        content,
        thinking,
      })
      await extractTurnMemory(opts.messageId, userText, content, includeMedia, opts.signal)
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
