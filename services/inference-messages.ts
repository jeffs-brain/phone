import type { Message as SdkMessage } from '@jeffs-brain/memory-react-native'
import type { RNLlamaMessagePart, RNLlamaOAICompatibleMessage } from 'llama.rn'

import { SYSTEM_PROMPT } from '../lib/constants'
import type { ContentPart, Message } from '../store/types'

export const textFromParts = (parts: readonly ContentPart[]): string =>
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

const cloudMediaPlaceholder = (parts: readonly ContentPart[]): string | null => {
  const hasImage = parts.some((part) => part.type === 'image')
  const hasAudio = parts.some((part) => part.type === 'audio')
  if (!hasImage && !hasAudio) return null
  if (hasImage && hasAudio) return '[Image and audio attachments were not sent to the cloud provider.]'
  if (hasImage) return '[Image attachment was not sent to the cloud provider.]'
  return '[Audio attachment was not sent to the cloud provider.]'
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
  return {
    role: message.role,
    content: toLlamaContent(message.parts, includeMediaForMessage),
  }
}

const isMediaPart = (part: ContentPart): part is Extract<ContentPart, { type: 'image' | 'audio' }> =>
  part.type === 'image' || part.type === 'audio'

export const messageRequiresMultimodal = (message: Message): boolean => message.parts.some(isMediaPart)

export const latestUserRequiresMultimodal = (messages: readonly Message[]): boolean => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role === 'user') return messageRequiresMultimodal(message)
  }
  return false
}

const latestUserMediaMessageId = (messages: readonly Message[]): string | null => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role !== 'user') continue
    return messageRequiresMultimodal(message) ? message.id : null
  }
  return null
}

export const latestUserText = (messages: readonly Message[]): string => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role === 'user') return textFromParts(message.parts)
  }
  return ''
}

export const buildLlamaMessages = (
  messages: readonly Message[],
  activeAssistantId: string,
  includeMedia: boolean,
): RNLlamaOAICompatibleMessage[] => {
  const mediaMessageId = includeMedia ? latestUserMediaMessageId(messages) : null
  const historical = messages
    .filter((message) => message.id !== activeAssistantId)
    .map((message) => toLlamaMessage(message, message.id === mediaMessageId))
    .filter((message): message is RNLlamaOAICompatibleMessage => message !== null)

  return [{ role: 'system', content: SYSTEM_PROMPT }, ...historical]
}

const toCloudMessage = (message: Message): SdkMessage | null => {
  if (message.role === 'tool') return null
  const text = textFromParts(message.parts).trim()
  const placeholder = cloudMediaPlaceholder(message.parts)
  const content = [text, placeholder]
    .filter((part): part is string => part !== null && part !== '')
    .join('\n\n')
  if (content === '') return null
  return { role: message.role, content }
}

export const buildCloudMessages = (
  messages: readonly Message[],
  activeAssistantId: string,
): SdkMessage[] =>
  messages
    .filter((message) => message.id !== activeAssistantId)
    .map(toCloudMessage)
    .filter((message): message is SdkMessage => message !== null)
