import { useCallback, useRef } from 'react'
import { FlatList, type ListRenderItemInfo } from 'react-native'

import type { Message } from '../../store/types'
import { EmptyState } from './empty-state'
import { MessageBubble } from './message-bubble'
import { styles } from './styles'

export type ChatMessageListProps = {
  readonly messages: readonly Message[]
  readonly onSuggestion: (text: string) => void
}

export function ChatMessageList({ messages, onSuggestion }: ChatMessageListProps) {
  const listRef = useRef<FlatList<Message>>(null)

  const scrollToEnd = useCallback(() => {
    if (messages.length === 0) return
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }))
  }, [messages.length])

  const renderMessage = useCallback(
    ({ item }: ListRenderItemInfo<Message>) => <MessageBubble message={item} />,
    [],
  )

  const renderEmptyState = useCallback(
    () => <EmptyState onSuggestion={onSuggestion} />,
    [onSuggestion],
  )

  return (
    <FlatList
      ref={listRef}
      data={messages}
      keyExtractor={(item) => item.id}
      renderItem={renderMessage}
      ListEmptyComponent={renderEmptyState}
      onContentSizeChange={scrollToEnd}
      onLayout={scrollToEnd}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[
        styles.messagesContent,
        messages.length === 0 ? styles.messagesContentEmpty : null,
      ]}
    />
  )
}
