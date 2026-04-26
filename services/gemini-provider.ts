import type {
  CompletionRequest,
  CompletionResponse,
  Message as SdkMessage,
  Provider,
  StopReason,
  StructuredRequest,
  Usage,
} from '@jeffs-brain/memory-react-native'

type GeminiProviderConfig = {
  readonly apiKey: string
  readonly model: string
  readonly endpoint?: string
  readonly defaultMaxTokens?: number
  readonly requestTimeoutMs?: number
}

type GeminiPart = {
  readonly text: string
}

type GeminiContent = {
  readonly role: 'user' | 'model'
  readonly parts: readonly GeminiPart[]
}

type GeminiRequestBody = {
  readonly contents: readonly GeminiContent[]
  readonly systemInstruction?: {
    readonly parts: readonly GeminiPart[]
  }
  readonly generationConfig?: {
    readonly maxOutputTokens?: number
    readonly temperature?: number
    readonly responseMimeType?: 'application/json'
    readonly responseSchema?: unknown
  }
}

type JsonRecord = Record<string, unknown>

const DEFAULT_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta'
const DEFAULT_MAX_TOKENS = 2048
const DEFAULT_REQUEST_TIMEOUT_MS = 20000

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const stringField = (record: JsonRecord, key: string): string | null => {
  const value = record[key]
  return typeof value === 'string' ? value : null
}

const numberField = (record: JsonRecord, key: string): number | undefined => {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

const textFromMessage = (message: SdkMessage): string => {
  if (typeof message.content === 'string') return message.content
  return message.blocks
    ?.flatMap((block) => block.type === 'text' && typeof block.text === 'string' ? [block.text] : [])
    .join('\n') ?? ''
}

const normaliseEndpoint = (endpoint: string): string =>
  endpoint.replace(/\/+$/, '')

const endpointForModel = (endpoint: string, model: string): string => {
  const cleanModel = model.replace(/^models\//, '')
  return `${normaliseEndpoint(endpoint)}/models/${encodeURIComponent(cleanModel)}:generateContent`
}

const collectSystemText = (request: CompletionRequest | StructuredRequest): string => [
  request.systemStatic,
  request.systemDynamic,
  request.system,
  ...request.messages.flatMap((message) =>
    message.role === 'system' ? [textFromMessage(message)] : [],
  ),
]
  .filter((part): part is string => typeof part === 'string' && part.trim() !== '')
  .join('\n\n')

const geminiRole = (message: SdkMessage): 'user' | 'model' | null => {
  if (message.role === 'assistant') return 'model'
  if (message.role === 'user') return 'user'
  if (message.role === 'tool') return 'user'
  return null
}

const appendContent = (
  contents: GeminiContent[],
  role: 'user' | 'model',
  text: string,
): void => {
  const trimmed = text.trim()
  if (trimmed === '') return

  const previous = contents[contents.length - 1]
  if (previous?.role === role) {
    contents[contents.length - 1] = {
      role,
      parts: [{ text: `${previous.parts.map((part) => part.text).join('\n\n')}\n\n${trimmed}` }],
    }
    return
  }

  contents.push({ role, parts: [{ text: trimmed }] })
}

const buildContents = (messages: readonly SdkMessage[]): readonly GeminiContent[] => {
  const contents: GeminiContent[] = []
  for (const message of messages) {
    const role = geminiRole(message)
    if (role === null) continue
    const prefix = message.role === 'tool' ? `Tool result${message.name === undefined ? '' : ` (${message.name})`}:\n` : ''
    appendContent(contents, role, `${prefix}${textFromMessage(message)}`)
  }

  if (contents.length === 0) {
    return [{ role: 'user', parts: [{ text: 'Continue.' }] }]
  }

  return contents
}

const buildBody = (
  request: CompletionRequest | StructuredRequest,
  schema?: unknown,
): GeminiRequestBody => {
  const systemText = collectSystemText(request)
  return {
    contents: buildContents(request.messages),
    ...(systemText === ''
      ? {}
      : {
          systemInstruction: {
            parts: [{ text: systemText }],
          },
        }),
    generationConfig: {
      maxOutputTokens: request.maxTokens,
      temperature: request.temperature,
      ...(schema === undefined
        ? {}
        : {
            responseMimeType: 'application/json',
            responseSchema: schema,
          }),
    },
  }
}

const jsonText = async (response: Response): Promise<string> => {
  try {
    return await response.text()
  } catch {
    return ''
  }
}

const requestSignal = (
  signal: AbortSignal | undefined,
  timeoutMs: number,
): {
  readonly signal: AbortSignal
  readonly didTimeout: () => boolean
  readonly cleanup: () => void
} => {
  const controller = new AbortController()
  let timedOut = false
  const abortFromCaller = (): void => controller.abort()
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  if (signal?.aborted === true) {
    abortFromCaller()
  } else {
    signal?.addEventListener('abort', abortFromCaller, { once: true })
  }

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    cleanup: () => {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', abortFromCaller)
    },
  }
}

const recordArray = (value: unknown): JsonRecord[] =>
  Array.isArray(value) ? value.filter(isRecord) : []

const responseText = (data: JsonRecord): string => {
  const candidate = recordArray(data.candidates)[0]
  const content = isRecord(candidate?.content) ? candidate.content : null
  const parts = recordArray(content?.parts)
  return parts
    .map((part) => stringField(part, 'text') ?? '')
    .filter((part) => part.trim() !== '')
    .join('')
    .trim()
}

const usageFromResponse = (data: JsonRecord): Usage => {
  const usage = isRecord(data.usageMetadata) ? data.usageMetadata : {}
  return {
    inputTokens: numberField(usage, 'promptTokenCount') ?? 0,
    outputTokens: numberField(usage, 'candidatesTokenCount') ?? 0,
    cacheReadTokens: numberField(usage, 'cachedContentTokenCount'),
  }
}

const stopReasonFromResponse = (data: JsonRecord): StopReason => {
  const candidate = recordArray(data.candidates)[0]
  const reason = candidate === undefined ? null : stringField(candidate, 'finishReason')
  if (reason === 'STOP') return 'end_turn'
  if (reason === 'MAX_TOKENS') return 'max_tokens'
  if (reason === 'SAFETY' || reason === 'RECITATION') return 'stop_sequence'
  return ''
}

const blockedReason = (data: JsonRecord): string | null => {
  const feedback = isRecord(data.promptFeedback) ? data.promptFeedback : null
  if (feedback === null) return null
  return stringField(feedback, 'blockReason')
}

const parseResponse = (text: string): CompletionResponse => {
  const parsed: unknown = JSON.parse(text)
  if (!isRecord(parsed)) throw new Error('gemini: invalid response shape')

  const content = responseText(parsed)
  if (content === '') {
    const reason = blockedReason(parsed)
    throw new Error(reason === null ? 'gemini: empty response' : `gemini: prompt blocked (${reason})`)
  }

  return {
    content,
    toolCalls: [],
    usage: usageFromResponse(parsed),
    stopReason: stopReasonFromResponse(parsed),
  }
}

const schemaObject = (schema: string): unknown => {
  try {
    return JSON.parse(schema)
  } catch (error) {
    throw new Error(`gemini: invalid JSON schema: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export class GeminiProvider implements Provider {
  private readonly apiKey: string
  private readonly model: string
  private readonly endpoint: string
  private readonly defaultMaxTokens: number
  private readonly requestTimeoutMs: number

  constructor(config: GeminiProviderConfig) {
    if (config.apiKey.trim() === '') throw new Error('gemini: apiKey required')
    if (config.model.trim() === '') throw new Error('gemini: model required')
    this.apiKey = config.apiKey
    this.model = config.model
    this.endpoint = config.endpoint ?? DEFAULT_ENDPOINT
    this.defaultMaxTokens = config.defaultMaxTokens ?? DEFAULT_MAX_TOKENS
    this.requestTimeoutMs = config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
  }

  name(): string {
    return 'gemini'
  }

  modelName(): string {
    return this.model
  }

  supportsStructuredDecoding(): boolean {
    return true
  }

  async complete(request: CompletionRequest, signal?: AbortSignal): Promise<CompletionResponse> {
    return await this.generate({
      ...request,
      maxTokens: request.maxTokens ?? this.defaultMaxTokens,
    }, signal)
  }

  async structured(request: StructuredRequest, signal?: AbortSignal): Promise<string> {
    const response = await this.generate({
      ...request,
      maxTokens: request.maxTokens ?? this.defaultMaxTokens,
    }, signal, schemaObject(request.schema))
    return response.content
  }

  private async generate(
    request: CompletionRequest | StructuredRequest,
    signal?: AbortSignal,
    schema?: unknown,
  ): Promise<CompletionResponse> {
    const activeSignal = requestSignal(signal, this.requestTimeoutMs)
    try {
      const response = await fetch(endpointForModel(this.endpoint, request.model ?? this.model), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': this.apiKey,
        },
        body: JSON.stringify(buildBody(request, schema)),
        signal: activeSignal.signal,
      })
      const text = await jsonText(response)

      if (!response.ok) {
        throw new Error(`gemini: request failed with status ${response.status}${text === '' ? '' : `: ${text}`}`)
      }

      return parseResponse(text)
    } catch (error) {
      if (activeSignal.didTimeout()) {
        throw new Error(`gemini: request timed out after ${this.requestTimeoutMs}ms`)
      }
      throw error
    } finally {
      activeSignal.cleanup()
    }
  }
}
