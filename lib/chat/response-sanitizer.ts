export type SanitisedModelResponse = {
  readonly content: string
  readonly thinking: string
}

type ChannelKind = 'final' | 'thinking'

type ChannelSegment = {
  readonly channel: ChannelKind
  readonly text: string
}

const CHANNEL_CONTROL_MARKER =
  /<\|channel\|?>\s*(analysis|thought|thinking|final|response)\s*|<channel\|>|<\|message\|>|<\|start\|>\s*assistant\s*|<\|end\|>/gi
const THINK_OPEN = '<think>'
const THINK_CLOSE = '</think>'
const VISIBLE_REASONING_LABELS = [
  'Thinking Process:',
  'Thought Process:',
  'Internal Reasoning:',
  'Reasoning:',
  'Analysis:',
  'Check Memory:',
  'Scratchpad:',
] as const
const VISIBLE_REASONING_START =
  /^\s*(?:Thinking Process|Thought Process|Internal Reasoning|Reasoning|Analysis|Check Memory|Scratchpad):\s*/i
const FINAL_RESPONSE_MARKER =
  /^\s*(?:\d+\.\s*)?(?:\*\*)?(?:Final Answer|Final Response|Final Output Generation|Answer|Response):(?:\*\*)?\s*/im

const normaliseWhitespace = (text: string): string =>
  text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

const markerChannel = (value: string): ChannelKind =>
  ['final', 'response'].includes(value.toLowerCase()) ? 'final' : 'thinking'

const isPotentialVisibleReasoningStart = (text: string): boolean => {
  const trimmed = text.trimStart().toLowerCase()
  if (trimmed === '') return false
  return VISIBLE_REASONING_LABELS.some((label) => label.toLowerCase().startsWith(trimmed))
}

const splitChannelMarkers = (text: string): readonly ChannelSegment[] => {
  const segments: ChannelSegment[] = []
  let cursor = 0
  let currentChannel: ChannelKind = 'final'
  let sawMarker = false

  CHANNEL_CONTROL_MARKER.lastIndex = 0
  let match = CHANNEL_CONTROL_MARKER.exec(text)
  while (match !== null) {
    if (match.index > cursor) {
      segments.push({
        channel: currentChannel,
        text: text.slice(cursor, match.index),
      })
    }
    sawMarker = true
    const nextChannel = match[1]
    if (nextChannel !== undefined) {
      currentChannel = markerChannel(nextChannel)
    } else if (match[0].toLowerCase() === '<channel|>') {
      currentChannel = 'final'
    }
    cursor = match.index + match[0].length
    match = CHANNEL_CONTROL_MARKER.exec(text)
  }

  if (!sawMarker) return [{ channel: 'final', text }]
  if (cursor < text.length) {
    segments.push({
      channel: currentChannel,
      text: text.slice(cursor),
    })
  }

  return segments
}

const splitThinkTags = (text: string): readonly ChannelSegment[] => {
  const lower = text.toLowerCase()
  const segments: ChannelSegment[] = []
  let cursor = 0

  while (cursor < text.length) {
    const openIndex = lower.indexOf(THINK_OPEN, cursor)
    if (openIndex === -1) {
      segments.push({ channel: 'final', text: text.slice(cursor) })
      break
    }

    if (openIndex > cursor) {
      segments.push({ channel: 'final', text: text.slice(cursor, openIndex) })
    }

    const contentStart = openIndex + THINK_OPEN.length
    const closeIndex = lower.indexOf(THINK_CLOSE, contentStart)
    if (closeIndex === -1) {
      segments.push({ channel: 'thinking', text: text.slice(contentStart) })
      break
    }

    segments.push({ channel: 'thinking', text: text.slice(contentStart, closeIndex) })
    cursor = closeIndex + THINK_CLOSE.length
  }

  return segments.length === 0 ? [{ channel: 'final', text }] : segments
}

const splitVisibleReasoningLabel = (text: string): readonly ChannelSegment[] => {
  const open = VISIBLE_REASONING_START.exec(text)
  if (open === null) {
    return isPotentialVisibleReasoningStart(text)
      ? [{ channel: 'thinking', text: '' }]
      : [{ channel: 'final', text }]
  }

  const marker = FINAL_RESPONSE_MARKER.exec(text.slice(open[0].length))
  if (marker === null) return [{ channel: 'thinking', text }]

  const finalStart = open[0].length + marker.index
  const contentStart = finalStart + marker[0].length
  return [
    { channel: 'thinking', text: text.slice(0, finalStart) },
    { channel: 'final', text: text.slice(contentStart) },
  ]
}

const splitResponse = (text: string): SanitisedModelResponse => {
  const channelSegments = splitChannelMarkers(text)
  const expanded = channelSegments.flatMap((segment) => {
    if (segment.channel === 'thinking') return [segment]
    return splitThinkTags(segment.text).flatMap((nested) => {
      if (nested.channel === 'thinking') return [nested]
      return splitVisibleReasoningLabel(nested.text)
    })
  })

  const content = expanded
    .filter((segment) => segment.channel === 'final')
    .map((segment) => segment.text)
    .join('')

  const thinking = expanded
    .filter((segment) => segment.channel === 'thinking')
    .map((segment) => segment.text)
    .join('\n\n')

  return {
    content: normaliseWhitespace(content),
    thinking: normaliseWhitespace(thinking),
  }
}

export const sanitiseModelResponse = (
  content: unknown,
  thinking: unknown = '',
): SanitisedModelResponse => {
  const rawContent = typeof content === 'string' ? content : ''
  const rawThinking = typeof thinking === 'string' ? thinking : ''
  const split = splitResponse(rawContent)

  return {
    content: split.content,
    thinking: normaliseWhitespace([rawThinking, split.thinking].filter((part) => part.trim() !== '').join('\n\n')),
  }
}
