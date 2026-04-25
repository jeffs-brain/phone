import type { ContentPart, Message, ToolCall } from '../../store/types'

export type ThinkingDetail = {
  readonly status: string
  readonly text: string
}

type StructuredThinking = {
  readonly status?: unknown
  readonly text?: unknown
}

type AttachmentWithDisplayName = ContentPart & {
  readonly fileName?: unknown
  readonly name?: unknown
}

const formatContentPart = (part: ContentPart): string => {
  if (part.type === 'text') return part.text
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

export const toolCallLabel = (toolCall: ToolCall): string => {
  if (toolCall.status === 'done') return `${toolCall.name} done`
  if (toolCall.status === 'error') return `${toolCall.name} failed`
  return `${toolCall.name} ${toolCall.status}`
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
  if (part.type === 'text') return `${part.type}-${part.text}-${index}`
  return `attachment-${index}`
}
