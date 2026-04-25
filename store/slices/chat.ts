import type { ContentPart, Message, Slice, ToolCall } from '../types'

export type ChatSlice = {
  messages: Message[]
  draft: string
  stagedAttachments: ContentPart[]
  setDraft: (draft: string) => void
  stageAttachment: (part: ContentPart) => void
  clearStaged: () => void
  sendUserMessage: () => Promise<void>
  beginAssistantMessage: (id: string) => void
  appendStreamingChunk: (id: string, chunk: string) => void
  commitStreamingMessage: (id: string) => void
  appendToolCall: (id: string, toolCall: ToolCall) => void
  clearMessages: () => void
}

export const createChatSlice: Slice<ChatSlice> = (set) => ({
  messages: [],
  draft: '',
  stagedAttachments: [],

  setDraft: (draft) => set({ draft }, false, 'chat/setDraft'),
  stageAttachment: (part) =>
    set((s) => ({ stagedAttachments: [...s.stagedAttachments, part] }), false, 'chat/stageAttachment'),
  clearStaged: () => set({ stagedAttachments: [] }, false, 'chat/clearStaged'),

  sendUserMessage: async () => {
    // 1. push user message into messages from draft + stagedAttachments
    // 2. clear draft + staged
    // 3. call inferenceService.generate(...)
  },

  beginAssistantMessage: (id) =>
    set((s) => ({
      messages: [
        ...s.messages,
        { id, role: 'assistant', parts: [], createdAt: Date.now(), streamingText: '' },
      ],
    }), false, 'chat/beginAssistantMessage'),

  appendStreamingChunk: (id, chunk) =>
    set((s) => {
      const msg = s.messages.find((m) => m.id === id)
      if (!msg) return s
      msg.streamingText = (msg.streamingText ?? '') + chunk
      return { messages: [...s.messages] }
    }, false, 'chat/appendStreamingChunk'),

  commitStreamingMessage: (id) =>
    set((s) => {
      const msg = s.messages.find((m) => m.id === id)
      if (!msg) return s
      const text = msg.streamingText ?? ''
      msg.parts = text ? [{ type: 'text', text }] : msg.parts
      msg.streamingText = undefined
      return { messages: [...s.messages] }
    }, false, 'chat/commitStreamingMessage'),

  appendToolCall: (id, toolCall) =>
    set((s) => {
      const msg = s.messages.find((m) => m.id === id)
      if (!msg) return s
      msg.toolCalls = [...(msg.toolCalls ?? []), toolCall]
      return { messages: [...s.messages] }
    }, false, 'chat/appendToolCall'),

  clearMessages: () => set({ messages: [] }, false, 'chat/clearMessages'),
})
