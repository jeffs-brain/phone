import {
  initLlama,
  type CompletionParams,
  type LlamaContext,
  type NativeCompletionResult,
  type RNLlamaOAICompatibleMessage,
  type ToolCall as LlamaToolCall,
} from 'llama.rn'
import type {
  ContentBlock as SdkContentBlock,
  CompletionRequest as SdkCompletionRequest,
  CompletionResponse as SdkCompletionResponse,
  Message as SdkMessage,
  StructuredRequest as SdkStructuredRequest,
} from '@jeffs-brain/memory-react-native'

import { APPLE_PROVIDER, GEMMA_STOPS, INFERENCE_CONFIG, SYSTEM_PROMPT, TOOL_LIMITS } from '../lib/constants'
import { sanitiseModelResponse } from '../lib/chat/response-sanitizer'
import { createId } from '../lib/id'
import { storeApi } from '../store'
import type { ModelId } from '../store/slices/inference'
import type { ContentPart, ProviderId } from '../store/types'
import { appleIntelligenceService, type AppleImageAnalysis } from './apple-intelligence'
import { cloudProviderService } from './cloud-provider'
import {
  buildCloudMessages as buildCloudMessageHistory,
  buildLlamaMessages,
  latestUserMediaPrompt,
  latestUserRequiresMultimodal,
  latestUserText,
} from './inference-messages'
import { appendBuffered, appendTokenData, finishStream } from './inference-stream'
import { MEMORY_TOOL_DEFINITIONS, MemoryToolArgumentError, memoryService } from './memory'
import { ensureModelFile, ensureProjectorFile, isModelFileCached, isProjectorFileCached } from './model-assets'
import {
  clearRuntimeMarker,
  disableGemmaVision,
  isGemmaVisionAutoDisabled,
  isMultimodalGpuAutoDisabled,
  writeRuntimeMarker,
} from './runtime-marker'

type LoadedContext = {
  readonly id: ModelId
  readonly context: LlamaContext
  readonly multimodalReady: boolean
  readonly multimodalGpuRequested: boolean | null
}

type GenerateOptions = {
  readonly messageId: string
  readonly provider: ProviderId
  readonly signal: AbortSignal
}

type LoadInFlight = {
  readonly id: ModelId
  readonly promise: Promise<void>
}

type CompletionRequest = Awaited<ReturnType<LlamaContext['parallel']['completion']>>
type CompletionTokenHandler = NonNullable<Parameters<LlamaContext['parallel']['completion']>[1]>
type SdkSystemPromptRequest = Pick<SdkCompletionRequest, 'systemStatic' | 'systemDynamic' | 'system'>
type VisionAssetStage = 'checking' | 'available' | 'downloading' | 'verifying' | 'downloaded'

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

type PreparedToolCall = {
  readonly call: LlamaToolCallWithId
  readonly args: unknown
  readonly argumentError?: string
}

type MemoryToolExecutionSummary = {
  readonly name: string
  readonly status: 'done' | 'error'
}

type GenerationOutcome = {
  readonly result: NativeCompletionResult
  readonly memoryToolExecutions: readonly MemoryToolExecutionSummary[]
}

export type RuntimeDiagnostics = {
  readonly profile: typeof INFERENCE_CONFIG.PROFILE
  readonly requestedGpuLayers: number
  readonly modelLoaded: boolean
  readonly modelId: ModelId | null
  readonly textGpuActive: boolean | null
  readonly reasonNoGpu: string | null
  readonly devices: readonly string[]
  readonly multimodalReady: boolean
  readonly multimodalGpuConfigured: boolean
  readonly multimodalGpuRequested: boolean | null
}

let loaded: LoadedContext | null = null
let loadInFlight: LoadInFlight | null = null
let multimodalInFlight: Promise<void> | null = null
let activeCompletion: CompletionRequest | null = null
const SIMULATOR_VISION_DISABLED_MESSAGE = [
  'I can attach and preview that image, but this simulator profile is running text-only Gemma.',
  'Remove EXPO_PUBLIC_SIMULATOR_VISION=disabled to run the local vision projector in iOS Simulator.',
].join(' ')
const CLOUD_SYSTEM_PROMPT = [
  'You are Jeff, a private assistant for the person using this app.',
  'Be direct, useful, and concise.',
  'This response is being produced by the selected cloud provider, so do not claim that this specific answer ran on-device.',
  'You do not have direct access to the phone memory tools in this cloud turn unless memory text appears in the prompt.',
].join('\n')
const MEMORY_TOOLS: object = MEMORY_TOOL_DEFINITIONS
const DISABLE_PARALLEL_TOOL_CALLS = false as unknown as object

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const currentGenerationOwnsState = (signal: AbortSignal): boolean =>
  storeApi.get().abortController?.signal === signal

const withAbortableTimeout = async <T>(
  promise: Promise<T>,
  signal: AbortSignal,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> => {
  if (signal.aborted) throw new Error('Generation cancelled.')

  let timeout: ReturnType<typeof setTimeout> | null = null
  let rejectForAbort: ((error: Error) => void) | null = null
  const onAbort = (): void => {
    rejectForAbort?.(new Error('Generation cancelled.'))
  }
  const abortPromise = new Promise<T>((_, reject) => {
    rejectForAbort = reject
    signal.addEventListener('abort', onAbort, { once: true })
    timeout = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      reject(new Error(timeoutMessage))
    }, timeoutMs)
  })

  try {
    return await Promise.race([promise, abortPromise])
  } finally {
    if (timeout !== null) clearTimeout(timeout)
    rejectForAbort = null
    signal.removeEventListener('abort', onAbort)
  }
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

const setVisionAssetProgress = (stage: VisionAssetStage, bytes: {
  readonly received: number
  readonly total: number
}): void => {
  const state = storeApi.get()
  if (stage === 'downloading') {
    state._setGenerationStatus('downloading-vision')
  } else if (stage === 'verifying') {
    state._setGenerationStatus('verifying-vision')
  } else if (stage === 'checking' || stage === 'available') {
    state._setGenerationStatus('checking-vision')
  }
  setAssetProgress(stage, bytes)
}

const buildMessages = (activeAssistantId: string, includeMedia: boolean): RNLlamaOAICompatibleMessage[] =>
  buildLlamaMessages(storeApi.get().messages, activeAssistantId, includeMedia)

const buildCloudMessages = (activeAssistantId: string): SdkMessage[] =>
  buildCloudMessageHistory(storeApi.get().messages, activeAssistantId)

const buildCompletionParams = (
  messageId: string,
  includeMedia: boolean,
  messages = buildMessages(messageId, includeMedia),
  enableTools = !includeMedia,
  allowThinking = true,
  maxTokens?: number,
): CompletionParams => {
  const enableThinking = allowThinking && !includeMedia && storeApi.get().thinkingEnabled
  return {
    messages,
    n_threads: INFERENCE_CONFIG.N_THREADS,
    n_predict: maxTokens ?? (
      enableThinking ? INFERENCE_CONFIG.CHAT_THINKING_MAX_TOKENS : INFERENCE_CONFIG.CHAT_MAX_TOKENS
    ),
    stop: [...GEMMA_STOPS],
    jinja: true,
    enable_thinking: enableThinking,
    reasoning_format: enableThinking ? 'auto' : 'none',
    temperature: INFERENCE_CONFIG.TEMPERATURE,
    top_p: INFERENCE_CONFIG.TOP_P,
    top_k: INFERENCE_CONFIG.TOP_K,
    ...(enableThinking
      ? {
          thinking_budget_tokens: INFERENCE_CONFIG.THINKING_BUDGET_TOKENS,
          thinking_budget_message: INFERENCE_CONFIG.THINKING_BUDGET_MESSAGE,
        }
      : {}),
    ...(enableTools
      ? {
          tools: MEMORY_TOOLS,
          tool_choice: 'auto',
        }
      : {}),
    parallel_tool_calls: DISABLE_PARALLEL_TOOL_CALLS,
  }
}

const buildMediaCompletionParams = (): CompletionParams => {
  const mediaPrompt = latestUserMediaPrompt(storeApi.get().messages)
  if (mediaPrompt === null || mediaPrompt.mediaPaths.length === 0) {
    throw new Error('Image attachment did not reach the local vision prompt.')
  }

  return {
    prompt: mediaPrompt.prompt,
    media_paths: [...mediaPrompt.mediaPaths],
    n_threads: INFERENCE_CONFIG.N_THREADS,
    n_predict: INFERENCE_CONFIG.VISION_MAX_TOKENS,
    stop: [...GEMMA_STOPS],
    enable_thinking: false,
    reasoning_format: 'none',
    temperature: INFERENCE_CONFIG.TEMPERATURE,
    top_p: INFERENCE_CONFIG.TOP_P,
    top_k: INFERENCE_CONFIG.TOP_K,
    parallel_tool_calls: DISABLE_PARALLEL_TOOL_CALLS,
  }
}

const throwIfAborted = (signal: AbortSignal): void => {
  if (signal.aborted) throw new Error('Generation cancelled.')
}

const shouldExtractTurnMemory = (
  userText: string,
  assistantText: string,
  includeMedia: boolean,
  memoryToolExecutions: readonly MemoryToolExecutionSummary[],
): boolean =>
  storeApi.get().rememberConversation
    && !includeMedia
    && !memoryToolExecutions.some((tool) =>
      tool.status === 'done' && (tool.name === 'memory_remember' || tool.name === 'memory_forget'),
    )
    && userText.trim() !== ''
    && assistantText.trim() !== ''

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

const structuredSystemMessages = (request: SdkSystemPromptRequest): RNLlamaOAICompatibleMessage[] =>
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
      'Return {"notes":[]} unless the user authored a stable personal fact, durable preference, relationship, long-term project detail, or explicit feedback that will matter in future chats.',
      'The assistant text is context only. Never save assistant guesses, suggestions, readiness messages, or generic summaries as user memory.',
      'Never create a memory just because the user asked a question about a personal fact. Only create a memory when the user actually supplied the answer or fact.',
      'Reject notes that say the user asked, is asking, wants to know, might provide something later, or that something should be remembered if provided later.',
      'Do not create memories for greetings, casual acknowledgements, jokes, image descriptions, transient questions, pending images/files, current-session next steps, or immediate workflow state.',
      'Do not store short-lived plans like "we will look at an image next"; only store longer-term plans or project facts that should survive this chat.',
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
      n_predict: request.maxTokens ?? INFERENCE_CONFIG.MEMORY_MAX_TOKENS,
      stop: [...GEMMA_STOPS],
      jinja: true,
      enable_thinking: false,
      reasoning_format: 'none',
      temperature: request.temperature ?? 0,
      force_pure_content: true,
      parallel_tool_calls: DISABLE_PARALLEL_TOOL_CALLS,
    },
  )
  return normaliseCompletionContent(result.content)
}

const memoryCompletion = async (
  request: SdkCompletionRequest,
  signal?: AbortSignal,
): Promise<SdkCompletionResponse> => {
  const messages = [
    ...structuredSystemMessages(request),
    ...request.messages
      .map(toStructuredLlamaMessage)
      .filter((message): message is RNLlamaOAICompatibleMessage => message !== null),
  ]

  const result = await completeWithLoadedContext(
    signal ?? new AbortController().signal,
    {
      messages,
      n_threads: INFERENCE_CONFIG.N_THREADS,
      n_predict: request.maxTokens ?? INFERENCE_CONFIG.MEMORY_MAX_TOKENS,
      stop: [...GEMMA_STOPS],
      jinja: true,
      enable_thinking: false,
      reasoning_format: 'none',
      temperature: request.temperature ?? 0,
      force_pure_content: true,
      parallel_tool_calls: DISABLE_PARALLEL_TOOL_CALLS,
    },
  )

  return {
    content: normaliseCompletionContent(result.content),
    toolCalls: [],
    usage: {
      inputTokens: 0,
      outputTokens: 0,
    },
    stopReason: '',
  }
}

const extractTurnMemory = async (
  messageId: string,
  userText: string,
  assistantText: string,
  includeMedia: boolean,
  memoryToolExecutions: readonly MemoryToolExecutionSummary[],
  signal: AbortSignal,
): Promise<void> => {
  if (!shouldExtractTurnMemory(userText, assistantText, includeMedia, memoryToolExecutions)) return
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

const stringifyToolArguments = (args: unknown): string => {
  try {
    return JSON.stringify(args ?? {}) ?? '{}'
  } catch {
    return '{}'
  }
}

const prepareToolCall = (call: LlamaToolCall): PreparedToolCall => {
  const normalised = normaliseToolCall(call)

  try {
    const args = parseToolArguments(normalised.function.arguments)
    return {
      call: {
        ...normalised,
        function: {
          ...normalised.function,
          arguments: stringifyToolArguments(args),
        },
      },
      args,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      call: {
        ...normalised,
        function: {
          ...normalised.function,
          arguments: '{}',
        },
      },
      args: {},
      argumentError: `Tool arguments were invalid JSON: ${message}`,
    }
  }
}

const normaliseCompletionContent = (content: unknown, thinking: unknown = ''): string =>
  sanitiseModelResponse(content, thinking).content

const completionLimitReason = (result: NativeCompletionResult): string | null => {
  const record: Record<string, unknown> = isRecord(result) ? result : {}
  if (record.context_full === true) return 'context'
  if (record.truncated === true) return 'prompt'

  const stoppedLimit = record.stopped_limit
  if (typeof stoppedLimit === 'number' && stoppedLimit > 0) return 'output'

  return null
}

const completionLimitMessage = (reason: string): string => {
  if (reason === 'context') return 'The local context filled before the model could finish. Try a shorter prompt or start a fresh chat.'
  if (reason === 'prompt') return 'The prompt was truncated before generation. Try a shorter prompt or fewer attachments.'
  return 'Stopped at the local token limit.'
}

const normaliseCompletionResult = (result: NativeCompletionResult): {
  readonly content: string
  readonly thinking: string
} => {
  const sanitised = sanitiseModelResponse(result.content, result.reasoning_content)
  const limitReason = completionLimitReason(result)
  const content = sanitised.content.trim() === ''
    ? limitReason === null
      ? 'I did not get a final answer from the model. Try again.'
      : completionLimitMessage(limitReason)
    : limitReason === null
      ? sanitised.content
      : `${sanitised.content}\n\n${completionLimitMessage(limitReason)}`
  return {
    content,
    thinking: storeApi.get().thinkingEnabled ? sanitised.thinking : '',
  }
}

const completionToolCalls = (result: NativeCompletionResult): readonly LlamaToolCall[] => {
  const rawResult: unknown = result
  const record = isRecord(rawResult) ? rawResult : {}
  return Array.isArray(record.tool_calls) ? record.tool_calls as LlamaToolCall[] : []
}

const toolErrorContent = (name: string, message: string, retryable: boolean): string =>
  JSON.stringify({
    error: {
      tool: name,
      message,
      retryable,
      expected: {
        memory_recall: { query: 'string', topK: 'number?' },
        memory_remember: { content: 'string', name: 'string?', path: 'string?', filename: 'string?', tags: 'string[]?' },
        memory_forget: { path: 'string' },
        memory_list: { limit: 'number?' },
      }[name] ?? 'Use the declared tool schema.',
    },
  })

const runMemoryToolCalls = async (
  messageId: string,
  toolCalls: readonly PreparedToolCall[],
): Promise<{
  readonly messages: readonly LlamaToolResultMessage[]
  readonly executions: readonly MemoryToolExecutionSummary[]
  readonly grounding: readonly string[]
}> => {
  if (toolCalls.length === 0) return { messages: [], executions: [], grounding: [] }

  storeApi.get()._setGenerationStatus('using-tools')
  const results: LlamaToolResultMessage[] = []
  const executions: MemoryToolExecutionSummary[] = []
  const grounding: string[] = []

  for (const prepared of toolCalls) {
    const call = prepared.call
    const id = call.id
    const name = call.function.name
    const args = prepared.args

    try {
      if (prepared.argumentError !== undefined) {
        throw new Error(prepared.argumentError)
      }
      storeApi.get().appendToolCall(messageId, {
        id,
        name,
        args,
        status: 'running',
      })
      const execution = await memoryService.runTool(name, args)
      storeApi.get().appendToolCall(messageId, {
        id,
        name,
        args,
        status: 'done',
        result: execution.result,
      })
      executions.push({ name, status: 'done' })
      grounding.push(`${name} result:\n${execution.content}`)
      results.push({
        role: 'tool',
        tool_call_id: id,
        name,
        content: execution.content,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const retryable = prepared.argumentError !== undefined || error instanceof MemoryToolArgumentError
      if (retryable) {
        storeApi.get().removeToolCall(messageId, id)
      } else {
        storeApi.get().appendToolCall(messageId, {
          id,
          name,
          args,
          status: 'error',
          error: message,
        })
      }
      executions.push({ name, status: 'error' })
      grounding.push(`${name} failed:\n${toolErrorContent(name, message, retryable)}`)
      results.push({
        role: 'tool',
        tool_call_id: id,
        name,
        content: toolErrorContent(name, message, retryable),
      })
    }
  }

  return { messages: results, executions, grounding }
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
  return !(await isMultimodalGpuAutoDisabled().catch(() => false))
}

const ensureMultimodalReady = async (): Promise<void> => {
  const current = loaded
  if (current === null) throw new Error('Local Gemma is not loaded.')
  if (current.multimodalReady) return
  if (multimodalInFlight !== null) return multimodalInFlight

  const promise = (async () => {
    if (storeApi.get().networkStatus === 'offline' && !isProjectorFileCached(current.id)) {
      throw new Error('The vision projector is not cached on this device. Connect once to download it before using image chat offline.')
    }

    const assets = await ensureProjectorFile(current.id, (progress) => {
      setVisionAssetProgress(progress.stage, {
        received: progress.bytesReceived,
        total: progress.bytesExpected,
      })
    })

    if (loaded?.context !== current.context) {
      throw new Error('Local Gemma changed while the projector was loading.')
    }

    storeApi.get()._setModelStatus('initialised')
    storeApi.get()._setGenerationStatus('initialising-vision')
    await writeRuntimeMarker({ modelId: current.id, stage: 'projector-load' })
    const useGpu = await shouldUseMultimodalGpu(current.context)
    const multimodalReady = await current.context.initMultimodal({
      path: assets.projectorPath,
      use_gpu: useGpu,
      image_max_tokens: INFERENCE_CONFIG.IMAGE_MAX_TOKENS,
    })
    if (!multimodalReady) {
      throw new Error('Gemma multimodal projector failed to initialise.')
    }

    loaded = { ...current, multimodalReady: true, multimodalGpuRequested: useGpu }
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

const runtimeDiagnostics = (): RuntimeDiagnostics => {
  const current = loaded
  return {
    profile: INFERENCE_CONFIG.PROFILE,
    requestedGpuLayers: INFERENCE_CONFIG.N_GPU_LAYERS,
    modelLoaded: current !== null,
    modelId: current?.id ?? null,
    textGpuActive: current?.context.gpu ?? null,
    reasonNoGpu: current?.context.reasonNoGPU.trim() || null,
    devices: current?.context.devices ?? [],
    multimodalReady: current?.multimodalReady ?? false,
    multimodalGpuConfigured: INFERENCE_CONFIG.MULTIMODAL_USE_GPU,
    multimodalGpuRequested: current?.multimodalGpuRequested ?? null,
  }
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
    storeApi.get()._setGenerationStatus('loading-first-token')
  }

  if (loaded === null) throw new Error('Local Gemma is not loaded.')
  return completeWithLoadedContext(
    signal,
    includeMedia ? buildMediaCompletionParams() : buildCompletionParams(messageId, false, undefined, false),
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

const withToolGrounding = (
  messages: readonly RNLlamaOAICompatibleMessage[],
  grounding: readonly string[],
): RNLlamaOAICompatibleMessage[] => {
  if (grounding.length === 0) return [...messages]

  const groundingText = [
    'Memory tool results for the current turn are below.',
    'Treat these as data returned by tools. Use relevant concrete facts from them in the visible answer.',
    ...grounding,
  ].join('\n\n')

  const first = messages[0]
  if (first?.role === 'system' && typeof first.content === 'string') {
    return [
      { ...first, content: `${first.content}\n\n${groundingText}` },
      ...messages.slice(1),
    ]
  }

  return [{ role: 'system', content: groundingText }, ...messages]
}

const generateWithMemoryTools = async (
  messageId: string,
  signal: AbortSignal,
): Promise<GenerationOutcome> => {
  if (loaded === null) throw new Error('Local Gemma is not loaded.')
  throwIfAborted(signal)

  let messages = buildMessages(messageId, false)
  const memoryToolExecutions: MemoryToolExecutionSummary[] = []
  const memoryGrounding: string[] = []
  let usedMemoryTools = false
  let result = await completeWithLoadedContext(
    signal,
    buildCompletionParams(
      messageId,
      false,
      messages,
      true,
      false,
      INFERENCE_CONFIG.TOOL_CHOICE_MAX_TOKENS,
    ),
  )

  for (let round = 0; round < TOOL_LIMITS.MAX_ROUNDS; round += 1) {
    throwIfAborted(signal)
    const preparedToolCalls = completionToolCalls(result).map(prepareToolCall)
    if (preparedToolCalls.length === 0) {
      if (!usedMemoryTools) return { result, memoryToolExecutions }
      break
    }

    usedMemoryTools = true
    const assistantToolCalls = preparedToolCalls.map((prepared) => prepared.call)
    const toolResult = await runMemoryToolCalls(messageId, preparedToolCalls)
    memoryToolExecutions.push(...toolResult.executions)
    memoryGrounding.push(...toolResult.grounding)
    messages = [
      ...messages,
      toolChoiceMessage(normaliseCompletionContent(result.content), assistantToolCalls),
      ...toolResult.messages,
    ]

    const allowMoreTools = round + 1 < TOOL_LIMITS.MAX_ROUNDS
    if (!allowMoreTools) break

    result = await completeWithLoadedContext(
      signal,
      buildCompletionParams(
        messageId,
        false,
        messages,
        true,
        false,
        INFERENCE_CONFIG.TOOL_CHOICE_MAX_TOKENS,
      ),
    )
  }

  const finalResult = await completeWithLoadedContext(
    signal,
    buildCompletionParams(messageId, false, withToolGrounding(messages, memoryGrounding), false),
    streamingTokenHandler(messageId),
  )
  return { result: finalResult, memoryToolExecutions }
}

const cloudCompletionResult = (content: string): NativeCompletionResult =>
  ({ content, reasoning_content: '' }) as NativeCompletionResult

const completionReasoningContent = (response: SdkCompletionResponse): string => {
  const record = response as SdkCompletionResponse & { readonly reasoning_content?: unknown }
  return typeof record.reasoning_content === 'string' ? record.reasoning_content : ''
}

const cloudCompletionWithThinking = (
  content: string,
  thinking: string,
): NativeCompletionResult =>
  ({ content, reasoning_content: thinking }) as NativeCompletionResult

const latestUserImage = (): Extract<ContentPart, { type: 'image' }> | null => {
  const messages = storeApi.get().messages
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role !== 'user') continue
    return message.parts.find((part): part is Extract<ContentPart, { type: 'image' }> => part.type === 'image') ?? null
  }
  return null
}

const imageAnalysisText = (analysis: AppleImageAnalysis): string => {
  const text = analysis.text.length === 0
    ? 'OCR: no text detected.'
    : ['OCR:', ...analysis.text.map((line) => `- ${line}`)].join('\n')
  const labels = analysis.labels.length === 0
    ? 'Labels: no confident labels detected.'
    : ['Labels:', ...analysis.labels.map((label) => `- ${label.identifier} (${Math.round(label.confidence * 100)}%)`)].join('\n')
  return [text, labels].join('\n\n')
}

const withAppleVisionGrounding = (
  messages: readonly RNLlamaOAICompatibleMessage[],
  analysis: AppleImageAnalysis,
  reason: string,
): RNLlamaOAICompatibleMessage[] => {
  const groundingText = [
    'Use these local Apple Vision signals from the attached image to answer the current image question.',
    `Gemma vision route: ${reason}.`,
    imageAnalysisText(analysis),
    'Answer only from these image signals and the user message. Say when the image signals are insufficient.',
  ].join('\n\n')

  const first = messages[0]
  if (first?.role === 'system' && typeof first.content === 'string') {
    return [
      { ...first, content: `${first.content}\n\n${groundingText}` },
      ...messages.slice(1),
    ]
  }

  return [{ role: 'system', content: groundingText }, ...messages]
}

const generateWithAppleVisionTextFallback = async (
  messageId: string,
  signal: AbortSignal,
  reason: string,
): Promise<GenerationOutcome> => {
  throwIfAborted(signal)
  const image = latestUserImage()
  if (image === null) throw new Error('Image attachment did not reach the local vision route.')

  storeApi.get()._setGenerationStatus('preparing-vision')
  const analysis = await withAbortableTimeout(
    appleIntelligenceService.analyseImage(image.uri),
    signal,
    APPLE_PROVIDER.IMAGE_ANALYSIS_TIMEOUT_MS,
    'Apple Vision image analysis timed out.',
  )
  throwIfAborted(signal)

  const messages = withAppleVisionGrounding(buildMessages(messageId, false), analysis, reason)
  const result = await completeWithLoadedContext(
    signal,
    buildCompletionParams(messageId, false, messages, false),
    streamingTokenHandler(messageId),
  )

  return { result, memoryToolExecutions: [] }
}

const generateWithAppleFoundation = async (
  messageId: string,
  signal: AbortSignal,
): Promise<GenerationOutcome> => {
  throwIfAborted(signal)
  const availability = await withAbortableTimeout(
    appleIntelligenceService.foundationAvailability(),
    signal,
    APPLE_PROVIDER.AVAILABILITY_TIMEOUT_MS,
    'Apple Foundation availability check timed out.',
  )
  if (!availability.available) {
    throw new Error(`Apple Foundation Models unavailable${availability.reason === null ? '' : `: ${availability.reason}`}.`)
  }

  const messages = storeApi.get().messages.filter((message) => message.id !== messageId)
  const appleMessages = appleIntelligenceService.buildTextMessages(messages)
  const image = latestUserImage()
  const finalMessages = image === null
    ? appleMessages
    : [
        ...appleMessages,
        {
          role: 'user' as const,
          content: [
            'Use these Apple Vision signals from the attached image to answer the current image question.',
            imageAnalysisText(await withAbortableTimeout(
              appleIntelligenceService.analyseImage(image.uri),
              signal,
              APPLE_PROVIDER.IMAGE_ANALYSIS_TIMEOUT_MS,
              'Apple Vision image analysis timed out.',
            )),
          ].join('\n\n'),
        },
      ]

  const content = await withAbortableTimeout(
    appleIntelligenceService.generateText({
      instructions: [
        SYSTEM_PROMPT,
        'This response is being produced by Apple Foundation Models on-device.',
        'If Apple Vision supplied OCR or labels, answer only from those image signals and say when they are insufficient.',
      ].join('\n'),
      messages: finalMessages,
      maxTokens: INFERENCE_CONFIG.CHAT_MAX_TOKENS,
    }),
    signal,
    APPLE_PROVIDER.TEXT_GENERATION_TIMEOUT_MS,
    'Apple Foundation text generation timed out.',
  )
  storeApi.get()._setGenerationStatus('streaming')
  appendBuffered(messageId, content)
  return {
    result: cloudCompletionResult(content),
    memoryToolExecutions: [],
  }
}

const generateWithCloud = async (
  messageId: string,
  signal: AbortSignal,
): Promise<GenerationOutcome> => {
  throwIfAborted(signal)
  const response = await cloudProviderService.complete(
    buildCloudMessages(messageId),
    CLOUD_SYSTEM_PROMPT,
    signal,
  )
  const result = cloudCompletionWithThinking(response.content, completionReasoningContent(response))
  const { content, thinking } = normaliseCompletionResult(result)
  storeApi.get()._setGenerationStatus('streaming')
  appendBuffered(messageId, content)
  return {
    result: cloudCompletionWithThinking(content, thinking),
    memoryToolExecutions: [],
  }
}

const markProviderFallback = (
  messageId: string,
  requestedProvider: ProviderId,
  reason: string,
): void => {
  const current = storeApi.get().messages.find((message) => message.id === messageId)?.routeDecision
  if (current === undefined) return
  const fallbackDecision = {
    ...current,
    provider: 'gemma-local',
    tier: 'medium',
    label: `local-route:${requestedProvider}-${reason}`,
    confidence: 0,
    routed: false,
  } as const
  storeApi.get().setAssistantRouteDecision(messageId, fallbackDecision)
  storeApi.get().setLastDecision(fallbackDecision)
}

const initialiseLlamaContext = async (id: ModelId, modelPath: string): Promise<LlamaContext> => {
  let lastError: unknown = null

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    storeApi.get()._setModelStatus('initialised')
    await writeRuntimeMarker({ modelId: id, stage: 'model-load' })
    let context: LlamaContext | null = null

    try {
      context = await initLlama({
        model: modelPath,
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
        context = null
        throw new Error('llama.rn parallel queue failed to initialise.')
      }

      await clearRuntimeMarker()
      return context
    } catch (error) {
      lastError = error
      await clearRuntimeMarker()
      await context?.release().catch(() => undefined)
      if (attempt < 2) await delay(850)
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Local model initialisation failed.')
}

const loadModelInternal = async (id: ModelId): Promise<void> => {
  if (loaded?.id === id && storeApi.get().modelStatus === 'ready') return

  const state = storeApi.get()
  state._setModelId(id)
  state._setModelStatus('checking')
  state._setModelError(null)
  state._setDownloadBytes(null)

  try {
    if (storeApi.get().networkStatus === 'offline' && !isModelFileCached(id)) {
      throw new Error('The local model is not cached on this device. Connect once to download it before using Jeff offline.')
    }

    const assets = await ensureModelFile(id, (progress) => {
      setAssetProgress(progress.stage, {
        received: progress.bytesReceived,
        total: progress.bytesExpected,
      })
    })

    state._setModelStatus('loaded')
    await releaseLoadedContext()

    const context = await initialiseLlamaContext(id, assets.modelPath)

    loaded = { id, context, multimodalReady: false, multimodalGpuRequested: null }
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
  if (loaded?.id === id && storeApi.get().modelStatus === 'ready') return
  if (loadInFlight?.id === id) return loadInFlight.promise
  if (loadInFlight !== null) await loadInFlight.promise.catch(() => undefined)

  const promise = loadModelInternal(id)
  loadInFlight = { id, promise }
  void promise.finally(() => {
    if (loadInFlight?.promise === promise) loadInFlight = null
  }).catch(() => undefined)
  return promise
}

memoryService.setCompletionProvider(memoryCompletion)
memoryService.setStructuredProvider(structuredMemoryCompletion)

export const inferenceService = {
  getRuntimeDiagnostics(): RuntimeDiagnostics {
    return runtimeDiagnostics()
  },

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
      const messages = storeApi.get().messages
      const userText = latestUserText(messages)
      throwIfAborted(opts.signal)

      const turnRequiresMedia = latestUserRequiresMultimodal(messages)
      let providerFallbackMarked = false

      const offline = storeApi.get().networkStatus === 'offline'
      if (opts.provider === 'cloud' && cloudProviderService.isConfigured() && !offline) {
        try {
          const outcome = await generateWithCloud(opts.messageId, opts.signal)
          const { content, thinking } = normaliseCompletionResult(outcome.result)
          finishStream(opts.messageId)
          state.commitStreamingMessage(opts.messageId, {
            content,
            thinking,
          })
          await extractTurnMemory(
            opts.messageId,
            userText,
            content,
            turnRequiresMedia,
            outcome.memoryToolExecutions,
            opts.signal,
          )
          state._setGenerationStatus('done')
          return
        } catch (error) {
          if (opts.signal.aborted) throw error
          markProviderFallback(opts.messageId, 'cloud', 'failed')
          providerFallbackMarked = true
        }
      }

      if (opts.provider === 'apple-fm') {
        try {
          const outcome = await generateWithAppleFoundation(opts.messageId, opts.signal)
          const { content, thinking } = normaliseCompletionResult(outcome.result)
          finishStream(opts.messageId)
          state.commitStreamingMessage(opts.messageId, {
            content,
            thinking,
          })
          await extractTurnMemory(
            opts.messageId,
            userText,
            content,
            turnRequiresMedia,
            outcome.memoryToolExecutions,
            opts.signal,
          )
          state._setGenerationStatus('done')
          return
        } catch (error) {
          if (opts.signal.aborted) throw error
          markProviderFallback(opts.messageId, 'apple-fm', 'unavailable')
          providerFallbackMarked = true
        }
      }

      if (opts.provider !== 'gemma-local' && !providerFallbackMarked) {
        markProviderFallback(
          opts.messageId,
          opts.provider,
          opts.provider === 'cloud'
            ? offline ? 'offline' : 'unconfigured'
            : 'unavailable',
        )
      }

      const gemmaVisionAutoDisabled = turnRequiresMedia
        ? await isGemmaVisionAutoDisabled().catch(() => false)
        : false
      const includeMedia = INFERENCE_CONFIG.MULTIMODAL_GENERATION_ENABLED
        && turnRequiresMedia
        && !gemmaVisionAutoDisabled
      if (turnRequiresMedia && !includeMedia) {
        if (!gemmaVisionAutoDisabled) {
          appendBuffered(opts.messageId, SIMULATOR_VISION_DISABLED_MESSAGE)
          finishStream(opts.messageId)
          state.commitStreamingMessage(opts.messageId)
          state._setGenerationStatus('done')
          return
        }
      }

      const targetModel = generationModelId(storeApi.get().modelSize, includeMedia)
      if (targetModel !== storeApi.get().modelSize) {
        storeApi.get().setModelSize(targetModel)
      }
      if (loaded?.id !== targetModel) {
        await this.loadModel(targetModel)
        throwIfAborted(opts.signal)
      }

      let outcome: GenerationOutcome
      if (!turnRequiresMedia) {
        outcome = await generateWithMemoryTools(opts.messageId, opts.signal)
      } else if (!includeMedia) {
        outcome = await generateWithAppleVisionTextFallback(opts.messageId, opts.signal, 'disabled after previous projector crash')
      } else {
        try {
          outcome = {
            result: await generateWithLoadedContext(opts.messageId, opts.signal, true),
            memoryToolExecutions: [],
          }
        } catch (error) {
          if (opts.signal.aborted) throw error
          await disableGemmaVision()
          outcome = await generateWithAppleVisionTextFallback(opts.messageId, opts.signal, 'projector initialisation failed')
        }
      }
      const result = outcome.result
      const { content, thinking } = normaliseCompletionResult(result)
      finishStream(opts.messageId)
      state.commitStreamingMessage(opts.messageId, {
        content,
        thinking,
      })
      await extractTurnMemory(
        opts.messageId,
        userText,
        content,
        includeMedia,
        outcome.memoryToolExecutions,
        opts.signal,
      )
      state._setGenerationStatus('done')
    } catch (error) {
      finishStream(opts.messageId)
      if (opts.signal.aborted) {
        if (currentGenerationOwnsState(opts.signal)) {
          state.commitStreamingMessage(opts.messageId)
          state._setGenerationStatus('idle')
        }
        return
      }

      const message = error instanceof Error ? error.message : String(error)
      appendBuffered(opts.messageId, `Local inference failed: ${message}`)
      finishStream(opts.messageId)
      state.commitStreamingMessage(opts.messageId)
      if (currentGenerationOwnsState(opts.signal)) {
        state._setGenerationStatus('error')
      }
    }
  },
}
