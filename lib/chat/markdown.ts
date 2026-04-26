export type MarkdownInline =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'strong'; readonly text: string }
  | { readonly type: 'emphasis'; readonly text: string }
  | { readonly type: 'code'; readonly text: string }

export type MarkdownBlock =
  | { readonly type: 'paragraph'; readonly inlines: readonly MarkdownInline[] }
  | { readonly type: 'heading'; readonly level: 1 | 2 | 3; readonly inlines: readonly MarkdownInline[] }
  | {
      readonly type: 'list'
      readonly ordered: boolean
      readonly items: readonly {
        readonly ordinal?: number
        readonly inlines: readonly MarkdownInline[]
      }[]
    }

const MARKDOWN_TOKEN = /(\*\*[^*\n][\s\S]*?\*\*|__[^_\n][\s\S]*?__|`[^`\n]+`|\*[^*\n]+\*|_[^_\n]+_)/g

const appendText = (segments: MarkdownInline[], text: string): void => {
  if (text !== '') segments.push({ type: 'text', text })
}

export const parseMarkdownInlines = (text: string): readonly MarkdownInline[] => {
  const segments: MarkdownInline[] = []
  let cursor = 0
  MARKDOWN_TOKEN.lastIndex = 0

  let match = MARKDOWN_TOKEN.exec(text)
  while (match !== null) {
    appendText(segments, text.slice(cursor, match.index))
    const token = match[0]
    if ((token.startsWith('**') && token.endsWith('**')) || (token.startsWith('__') && token.endsWith('__'))) {
      segments.push({ type: 'strong', text: token.slice(2, -2) })
    } else if (token.startsWith('`') && token.endsWith('`')) {
      segments.push({ type: 'code', text: token.slice(1, -1) })
    } else {
      segments.push({ type: 'emphasis', text: token.slice(1, -1) })
    }
    cursor = match.index + token.length
    match = MARKDOWN_TOKEN.exec(text)
  }

  appendText(segments, text.slice(cursor))
  return segments.length === 0 ? [{ type: 'text', text }] : segments
}

const normaliseLine = (line: string): string => line.replace(/\s+$/g, '')

export const parseMarkdown = (text: string): readonly MarkdownBlock[] => {
  const blocks: MarkdownBlock[] = []
  const paragraphLines: string[] = []
  let list: Extract<MarkdownBlock, { type: 'list' }> | null = null

  const flushParagraph = (): void => {
    if (paragraphLines.length === 0) return
    const content = paragraphLines.join('\n').trim()
    paragraphLines.length = 0
    if (content !== '') blocks.push({ type: 'paragraph', inlines: parseMarkdownInlines(content) })
  }

  const flushList = (): void => {
    if (list === null) return
    blocks.push(list)
    list = null
  }

  for (const rawLine of text.replace(/\r\n/g, '\n').split('\n')) {
    const line = normaliseLine(rawLine)
    if (line.trim() === '') {
      flushParagraph()
      flushList()
      continue
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line)
    if (heading !== null) {
      const marker = heading[1] ?? '#'
      const headingText = heading[2] ?? ''
      flushParagraph()
      flushList()
      blocks.push({
        type: 'heading',
        level: marker.length as 1 | 2 | 3,
        inlines: parseMarkdownInlines(headingText.trim()),
      })
      continue
    }

    const unordered = /^\s*[-*+]\s+(.+)$/.exec(line)
    if (unordered !== null) {
      const itemText = unordered[1] ?? ''
      flushParagraph()
      if (list === null || list.ordered) list = { type: 'list', ordered: false, items: [] }
      list = {
        ...list,
        items: [...list.items, { inlines: parseMarkdownInlines(itemText.trim()) }],
      }
      continue
    }

    const ordered = /^\s*(\d+)[.)]\s+(.+)$/.exec(line)
    if (ordered !== null) {
      const ordinalText = ordered[1] ?? '1'
      const itemText = ordered[2] ?? ''
      flushParagraph()
      if (list === null || !list.ordered) list = { type: 'list', ordered: true, items: [] }
      list = {
        ...list,
        items: [
          ...list.items,
          {
            ordinal: Number(ordinalText),
            inlines: parseMarkdownInlines(itemText.trim()),
          },
        ],
      }
      continue
    }

    flushList()
    paragraphLines.push(line.trim())
  }

  flushParagraph()
  flushList()
  return blocks
}
