import { createId } from '../../lib/id'
import { routerService } from '../../services/router'
import type { ContentPart, GenerationStatus, Message, RouteDecision, Slice, ToolCall } from '../types'

const ACTIVE_GENERATION_STATUSES: readonly GenerationStatus[] = [
  'routing',
  'preparing-vision',
  'checking-vision',
  'downloading-vision',
  'verifying-vision',
  'initialising-vision',
  'loading-first-token',
  'thinking',
  'using-tools',
  'streaming',
]

export type SendUserMessageInput = {
  readonly text?: string
  readonly attachments?: readonly ContentPart[]
}

export type CommitStreamingMessageInput = {
  readonly content?: string
  readonly thinking?: string
}

export type ChatSlice = {
  threadId: string
  messages: Message[]
  draft: string
  stagedAttachments: ContentPart[]
  setDraft: (draft: string) => void
  stageAttachment: (part: ContentPart) => void
  removeStagedAttachment: (index: number) => void
  clearStaged: () => void
  sendUserMessage: (input?: SendUserMessageInput) => Promise<void>
  beginAssistantMessage: (id: string, routeDecision?: RouteDecision) => void
  appendStreamingChunk: (id: string, chunk: string) => void
  appendThinkingChunk: (id: string, chunk: string) => void
  markThinkingDone: (id: string) => void
  commitStreamingMessage: (id: string, final?: CommitStreamingMessageInput) => void
  appendToolCall: (id: string, toolCall: ToolCall) => void
  removeToolCall: (id: string, toolCallId: string) => void
  setAssistantRouteDecision: (id: string, routeDecision: RouteDecision) => void
  startNewThread: () => void
  clearMessages: () => void
}

export const createChatSlice: Slice<ChatSlice> = (set, get) => ({
  threadId: createId('thread'),
  messages: [],
  draft: '',
  stagedAttachments: [],

  setDraft: (draft) => set({ draft }, false, 'chat/setDraft'),
  stageAttachment: (part) =>
    set((s) => ({ stagedAttachments: [...s.stagedAttachments, part] }), false, 'chat/stageAttachment'),
  removeStagedAttachment: (index) =>
    set((s) => ({
      stagedAttachments: s.stagedAttachments.filter((_, stagedIndex) => stagedIndex !== index),
    }), false, 'chat/removeStagedAttachment'),
  clearStaged: () => set({ stagedAttachments: [] }, false, 'chat/clearStaged'),

  sendUserMessage: async (input) => {
    const state = get()
    if (ACTIVE_GENERATION_STATUSES.includes(state.generationStatus)) return

    const text = (input?.text ?? state.draft).trim()
    const attachments = [...(input?.attachments ?? state.stagedAttachments)]
    const parts: ContentPart[] = [
      ...(text === '' ? [] : [{ type: 'text' as const, text }]),
      ...attachments,
    ]
    if (parts.length === 0) return

    const abortController = new AbortController()
    get()._setGenerationStatus('routing')
    get()._setAbortController(abortController)

    const userMessage: Message = {
      id: createId('user'),
      role: 'user',
      parts,
      createdAt: Date.now(),
    }

    set((s) => ({
      messages: [...s.messages, userMessage],
      draft: '',
      stagedAttachments: [],
    }), false, 'chat/sendUserMessage')

    const routingText = text !== ''
      ? text
      : attachments.some((part) => part.type === 'image' || part.type === 'audio')
        ? 'Message with media attachment'
        : 'Message with file attachment'
    const history = state.messages
      .slice(-6)
      .map((message) => message.parts
        .filter((part): part is Extract<ContentPart, { type: 'text' }> => part.type === 'text')
        .map((part) => `${message.role}: ${part.text}`)
      .join('\n'))
      .filter((line) => line.trim() !== '')

    try {
      const routeDecision = state.providerMode === 'smart'
        ? await routerService.classify(routingText, history, state.manualProvider)
        : routerService.manual(state.manualProvider)

      if (abortController.signal.aborted) {
        get()._setGenerationStatus('idle')
        return
      }

      get().setLastDecision(routeDecision)

      const assistantMessageId = createId('assistant')
      get().beginAssistantMessage(assistantMessageId, routeDecision)

      const { inferenceService } = await import('../../services/inference')
      await inferenceService.generate({
        messageId: assistantMessageId,
        provider: routeDecision.provider,
        signal: abortController.signal,
      })
    } catch (error) {
      if (abortController.signal.aborted) {
        get()._setGenerationStatus('idle')
        return
      }
      get()._setGenerationStatus('error')
      throw error
    } finally {
      get()._setAbortController(null)
    }
  },

  beginAssistantMessage: (id, routeDecision) =>
    set((s) => ({
      messages: [
        ...s.messages,
        {
          id,
          role: 'assistant',
          parts: [],
          routeDecision,
          createdAt: Date.now(),
          streamingText: '',
          thinking: { text: '', status: 'streaming' },
        },
      ],
    }), false, 'chat/beginAssistantMessage'),

  appendStreamingChunk: (id, chunk) =>
    set((s) => {
      return {
        messages: s.messages.map((message) =>
          message.id === id
            ? { ...message, streamingText: (message.streamingText ?? '') + chunk }
            : message,
        ),
      }
    }, false, 'chat/appendStreamingChunk'),

  appendThinkingChunk: (id, chunk) => {
    if (chunk === '') return

    set((s) => {
      return {
        messages: s.messages.map((message) => {
          if (message.id !== id) return message
          const thinking = message.thinking ?? { text: '', status: 'streaming' as const }
          return {
            ...message,
            thinking: {
              text: thinking.text + chunk,
              status: 'streaming',
            },
          }
        }),
      }
    }, false, 'chat/appendThinkingChunk')
  },

  markThinkingDone: (id) =>
    set((s) => {
      return {
        messages: s.messages.map((message) => {
          if (message.id !== id) return message
          const thinking = message.thinking ?? { text: '', status: 'streaming' as const }
          return {
            ...message,
            thinking: {
              ...thinking,
              status: 'done',
            },
          }
        }),
      }
    }, false, 'chat/markThinkingDone'),

  commitStreamingMessage: (id, final) =>
    set((s) => {
      return {
        messages: s.messages.map((message) => {
          if (message.id !== id) return message
          const finalContent = final?.content?.trim()
          const text = finalContent === undefined || finalContent === ''
            ? message.streamingText ?? ''
            : finalContent
          const parts = text === '' ? message.parts : [{ type: 'text' as const, text }]
          const finalThinking = final?.thinking?.trim()
          const thinking = message.thinking === undefined
            ? undefined
            : {
                text: finalThinking === undefined || finalThinking === ''
                  ? message.thinking.text
                  : finalThinking,
                status: 'done' as const,
              }
          return { ...message, parts, thinking, streamingText: undefined }
        }),
      }
    }, false, 'chat/commitStreamingMessage'),

  appendToolCall: (id, toolCall) =>
    set((s) => {
      return {
        messages: s.messages.map((message) => {
          if (message.id !== id) return message
          const toolCalls = message.toolCalls ?? []
          const existingIndex = toolCalls.findIndex((existing) => existing.id === toolCall.id)
          if (existingIndex === -1) return { ...message, toolCalls: [...toolCalls, toolCall] }

          return {
            ...message,
            toolCalls: toolCalls.map((existing, index) => index === existingIndex ? toolCall : existing),
          }
        }),
      }
    }, false, 'chat/appendToolCall'),

  removeToolCall: (id, toolCallId) =>
    set((s) => ({
      messages: s.messages.map((message) =>
        message.id === id
          ? { ...message, toolCalls: message.toolCalls?.filter((toolCall) => toolCall.id !== toolCallId) }
          : message,
      ),
    }), false, 'chat/removeToolCall'),

  setAssistantRouteDecision: (id, routeDecision) =>
    set((s) => ({
      messages: s.messages.map((message) =>
        message.id === id ? { ...message, routeDecision } : message,
      ),
    }), false, 'chat/setAssistantRouteDecision'),

  startNewThread: () =>
    set({
      threadId: createId('thread'),
      messages: [],
      draft: '',
      stagedAttachments: [],
    }, false, 'chat/startNewThread'),
  clearMessages: () =>
    set({
      threadId: createId('thread'),
      messages: [],
      draft: '',
      stagedAttachments: [],
    }, false, 'chat/clearMessages'),
})
