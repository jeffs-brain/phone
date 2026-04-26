import type { ContentPart, Message, ToolCall } from '../../store/types'

export type ThinkingDetail = {
  readonly status: string
  readonly text: string
}

type StructuredThinking = {
  readonly status?: unknown
  readonly text?: unknown
}

type AttachmentWithDisplayName = ContentPart & { readonly fileName?: unknown; readonly name?: unknown }
type JsonRecord = Record<string, unknown>

const formatContentPart = (part: ContentPart): string => {
  if (part.type === 'text') return part.text
  if (part.type === 'file') return ''
  if (part.type === 'image') return ''
  return `Audio attached (${Math.round(part.durationMs / 1000)}s)`
}

const isStructuredThinking = (value: unknown): value is StructuredThinking => (
  typeof value === 'object' && value !== null
)

export const getThinkingDetail = (thinking: unknown): ThinkingDetail | null => {
  if (typeof thinking === 'string') {
    const text = thinking.trim()
    return text === '' ? null : { status: 'Thinking', text }
  }

  if (!isStructuredThinking(thinking)) return null

  const text = typeof thinking.text === 'string' ? thinking.text.trim() : ''
  const status = thinking.status === 'done' ? 'Thoughts' : 'Thinking'

  if (text === '') return null
  return { status, text }
}

export const getMessageText = (message: Message): string => {
  if (message.streamingText !== undefined) return message.streamingText
  return message.parts.map(formatContentPart).filter((part) => part.trim() !== '').join('\n\n')
}

export const getImageParts = (message: Message): Extract<ContentPart, { type: 'image' }>[] =>
  message.parts.filter((part): part is Extract<ContentPart, { type: 'image' }> => part.type === 'image')

export const getFileParts = (message: Message): Extract<ContentPart, { type: 'file' }>[] =>
  message.parts.filter((part): part is Extract<ContentPart, { type: 'file' }> => part.type === 'file')

const TOOL_NAMES: Record<string, string> = {
  memory_recall: 'Memory search',
  memory_list: 'Memory list',
  memory_remember: 'Save memory',
  memory_forget: 'Forget memory',
}

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const recordString = (value: JsonRecord, key: string): string | null => {
  const raw = value[key]
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return trimmed === '' ? null : trimmed
}

const toolStatus = (toolCall: ToolCall): string => {
  if (toolCall.status === 'done') return 'done'
  if (toolCall.status === 'error') return 'failed'
  if (toolCall.status === 'running') return 'running'
  return 'queued'
}

export const toolCallLabel = (toolCall: ToolCall): string => {
  const name = TOOL_NAMES[toolCall.name] ?? toolCall.name
  return `${name} ${toolStatus(toolCall)}`
}

export const toolCallDetail = (toolCall: ToolCall): string | null => {
  if (toolCall.status === 'error') return toolCall.error ?? 'Tool failed.'
  if (toolCall.result === undefined) return null

  if (Array.isArray(toolCall.result)) {
    const count = `${toolCall.result.length} result${toolCall.result.length === 1 ? '' : 's'}`
    const sources = toolCall.result
      .filter(isRecord)
      .map((result) => recordString(result, 'source') ?? recordString(result, 'name') ?? recordString(result, 'id'))
      .filter((source): source is string => source !== null)
      .slice(0, 2)
    return sources.length === 0 ? count : `${count}: ${sources.join(', ')}`
  }

  if (isRecord(toolCall.result)) {
    const name = recordString(toolCall.result, 'name')
    if (name !== null) return name
    const path = recordString(toolCall.result, 'path')
    if (path !== null) return path
  }

  return null
}

const getAttachmentDisplayName = (part: ContentPart): string | null => {
  const namedPart = part as AttachmentWithDisplayName
  const name = namedPart.fileName ?? namedPart.name
  if (typeof name !== 'string') return null

  const trimmed = name.trim()
  return trimmed === '' ? null : trimmed
}

export const getStagedAttachmentLabel = (part: ContentPart, index: number): string => {
  const name = getAttachmentDisplayName(part)
  if (name !== null) return name
  if (part.type === 'file') return part.name
  if (part.type === 'image') return `Image ${index + 1}`
  if (part.type === 'audio') return `Audio ${Math.round(part.durationMs / 1000)}s`
  if (part.type === 'text') {
    const text = part.text.trim()
    return text === '' ? `Text ${index + 1}` : text
  }
  return `File ${index + 1}`
}

export const getStagedAttachmentKey = (part: ContentPart, index: number): string => {
  if (part.type === 'image' || part.type === 'audio') return `${part.type}-${part.uri}-${index}`
  if (part.type === 'file') return `${part.type}-${part.name}-${part.size ?? 0}-${index}`
  if (part.type === 'text') return `${part.type}-${part.text}-${index}`
  return `attachment-${index}`
}
