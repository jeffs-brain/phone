import { useMemo, type ReactNode } from 'react'
import { Text, View, type StyleProp, type TextStyle } from 'react-native'

import { parseMarkdown, type MarkdownBlock, type MarkdownInline } from '../../lib/chat/markdown'
import { styles } from './styles'

type MarkdownTextProps = {
  readonly text: string
  readonly textStyle?: StyleProp<TextStyle>
}

const inlineStyle = (inline: MarkdownInline): StyleProp<TextStyle> => {
  if (inline.type === 'strong') return styles.markdownStrong
  if (inline.type === 'emphasis') return styles.markdownEmphasis
  if (inline.type === 'code') return styles.markdownCode
  return null
}

const renderInlines = (inlines: readonly MarkdownInline[], keyPrefix: string): ReactNode[] =>
  inlines.map((inline, index) => (
    <Text key={`${keyPrefix}-${index}`} style={inlineStyle(inline)}>
      {inline.text}
    </Text>
  ))

const renderParagraph = (
  block: Extract<MarkdownBlock, { type: 'paragraph' | 'heading' }>,
  index: number,
  textStyle: StyleProp<TextStyle>,
): ReactNode => (
  <Text
    key={`paragraph-${index}`}
    style={[
      styles.messageText,
      textStyle,
      block.type === 'heading' ? styles.markdownHeading : null,
      index === 0 ? null : styles.markdownBlockSpacing,
    ]}
  >
    {renderInlines(block.inlines, `paragraph-${index}`)}
  </Text>
)

const renderList = (
  block: Extract<MarkdownBlock, { type: 'list' }>,
  index: number,
  textStyle: StyleProp<TextStyle>,
): ReactNode => (
  <View key={`list-${index}`} style={[styles.markdownList, index === 0 ? null : styles.markdownBlockSpacing]}>
    {block.items.map((item, itemIndex) => (
      <View key={`list-${index}-${itemIndex}`} style={styles.markdownListItem}>
        <Text style={[styles.messageText, textStyle, styles.markdownListMarker]}>
          {block.ordered ? `${item.ordinal ?? itemIndex + 1}.` : '\u2022'}
        </Text>
        <Text style={[styles.messageText, textStyle, styles.markdownListText]}>
          {renderInlines(item.inlines, `list-${index}-${itemIndex}`)}
        </Text>
      </View>
    ))}
  </View>
)

export function MarkdownText({ text, textStyle }: MarkdownTextProps) {
  const blocks = useMemo(() => parseMarkdown(text), [text])
  if (blocks.length === 0) return null

  return (
    <View>
      {blocks.map((block, index) => {
        if (block.type === 'list') return renderList(block, index, textStyle)
        return renderParagraph(block, index, textStyle)
      })}
    </View>
  )
}
