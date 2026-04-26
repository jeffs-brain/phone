import { describe, expect, it } from 'bun:test'

import type { Message } from '../../store/types'
import {
  getFileParts,
  getImageParts,
  getMessageText,
  getStagedAttachmentKey,
  getStagedAttachmentLabel,
  getThinkingDetail,
  toolCallDetail,
  toolCallLabel,
} from './message-helpers'

const message = (overrides: Partial<Message>): Message => ({
  id: 'message-1',
  role: 'assistant',
  parts: [],
  createdAt: 1,
  ...overrides,
})

describe('message helpers', () => {
  it('uses streaming text ahead of committed message parts', () => {
    expect(getMessageText(message({
      streamingText: 'live text',
      parts: [{ type: 'text', text: 'committed text' }],
    }))).toEqual('live text')
  })

  it('keeps file content out of visible chat text while preserving file parts', () => {
    const note = message({
      parts: [
        { type: 'text', text: 'Read this' },
        { type: 'file', name: 'notes.md', text: 'private file context', mimeType: 'text/markdown' },
      ],
    })

    expect(getMessageText(note)).toEqual('Read this')
    expect(getFileParts(note).map((part) => part.name)).toEqual(['notes.md'])
  })

  it('extracts image parts without treating them as visible text', () => {
    const photo = message({
      parts: [
        { type: 'text', text: 'What is this?' },
        { type: 'image', uri: 'file:///tmp/image.jpg', name: 'image.jpg' },
      ],
    })

    expect(getMessageText(photo)).toEqual('What is this?')
    expect(getImageParts(photo).map((part) => part.uri)).toEqual(['file:///tmp/image.jpg'])
  })

  it('normalises thinking display state', () => {
    expect(getThinkingDetail({ text: ' hidden ', status: 'done' })).toEqual({
      status: 'Thoughts',
      text: 'hidden',
    })
    expect(getThinkingDetail({ text: ' ', status: 'done' })).toEqual(null)
  })

  it('labels memory tool calls with useful status and result detail', () => {
    expect(toolCallLabel({
      id: 'tool-1',
      name: 'memory_recall',
      args: {},
      status: 'done',
      result: [{ id: 'memory-1' }],
    })).toEqual('Memory search done')

    expect(toolCallDetail({
      id: 'tool-1',
      name: 'memory_remember',
      args: {},
      status: 'done',
      result: { name: 'Favourite food' },
    })).toEqual('Favourite food')
  })

  it('builds stable staged attachment labels and keys', () => {
    const image = { type: 'image' as const, uri: 'file:///tmp/photo.jpg' }
    expect(getStagedAttachmentLabel(image, 0)).toEqual('Image 1')
    expect(getStagedAttachmentKey(image, 0)).toEqual('image-file:///tmp/photo.jpg-0')
  })
})
