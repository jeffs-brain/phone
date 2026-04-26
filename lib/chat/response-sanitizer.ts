export type SanitisedModelResponse = {
  readonly content: string
  readonly thinking: string
}

type ChannelKind = 'final' | 'thinking'

type ChannelSegment = {
  readonly channel: ChannelKind
  readonly text: string
}

const CHANNEL_MARKER = /<\|channel\|>\s*(analysis|thought|thinking|final)\s*/gi
const THINK_OPEN = '<think>'
const THINK_CLOSE = '</think>'

const normaliseWhitespace = (text: string): string =>
  text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

const markerChannel = (value: string): ChannelKind =>
  value.toLowerCase() === 'final' ? 'final' : 'thinking'

const splitChannelMarkers = (text: string): readonly ChannelSegment[] => {
  const segments: ChannelSegment[] = []
  let cursor = 0
  let currentChannel: ChannelKind = 'final'
  let sawMarker = false

  CHANNEL_MARKER.lastIndex = 0
  let match = CHANNEL_MARKER.exec(text)
  while (match !== null) {
    if (match.index > cursor) {
      segments.push({
        channel: currentChannel,
        text: text.slice(cursor, match.index),
      })
    }
    sawMarker = true
    currentChannel = markerChannel(match[1] ?? 'final')
    cursor = match.index + match[0].length
    match = CHANNEL_MARKER.exec(text)
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

const splitResponse = (text: string): SanitisedModelResponse => {
  const channelSegments = splitChannelMarkers(text)
  const expanded = channelSegments.flatMap((segment) => {
    if (segment.channel === 'thinking') return [segment]
    return splitThinkTags(segment.text)
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
