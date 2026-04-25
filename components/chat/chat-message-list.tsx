import { useCallback, useRef, useState } from 'react'
import {
  FlatList,
  Pressable,
  Text,
  View,
  type LayoutChangeEvent,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'

import { hapticButton } from '../../lib/haptics'
import type { Message } from '../../store/types'
import { EmptyState } from './empty-state'
import { MessageBubble } from './message-bubble'
import { styles } from './styles'

const NEAR_END_THRESHOLD = 96

export type ChatMessageListProps = {
  readonly messages: readonly Message[]
  readonly onSuggestion: (text: string) => void
}

export function ChatMessageList({ messages, onSuggestion }: ChatMessageListProps) {
  const listRef = useRef<FlatList<Message>>(null)
  const contentHeightRef = useRef(0)
  const hasMeasuredContentRef = useRef(false)
  const isNearEndRef = useRef(true)
  const layoutHeightRef = useRef(0)
  const scrollOffsetRef = useRef(0)
  const [isNearEnd, setIsNearEnd] = useState(true)

  const setNearEnd = useCallback((nextIsNearEnd: boolean) => {
    isNearEndRef.current = nextIsNearEnd
    setIsNearEnd((currentIsNearEnd) => (
      currentIsNearEnd === nextIsNearEnd ? currentIsNearEnd : nextIsNearEnd
    ))
  }, [])

  const scrollToEnd = useCallback((animated: boolean) => {
    if (messages.length === 0) return
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated }))
  }, [messages.length])

  const updateNearEnd = useCallback((
    contentHeight: number,
    layoutHeight: number,
    scrollOffset: number,
  ) => {
    if (contentHeight <= 0 || layoutHeight <= 0) {
      setNearEnd(true)
      return
    }

    const distanceFromEnd = Math.max(0, contentHeight - layoutHeight - Math.max(0, scrollOffset))
    setNearEnd(distanceFromEnd <= NEAR_END_THRESHOLD)
  }, [setNearEnd])

  const handleContentSizeChange = useCallback((_width: number, height: number) => {
    const shouldAutoScroll = isNearEndRef.current
    contentHeightRef.current = height

    if (messages.length === 0) {
      setNearEnd(true)
      hasMeasuredContentRef.current = false
      return
    }

    if (shouldAutoScroll) {
      scrollToEnd(hasMeasuredContentRef.current)
    } else {
      updateNearEnd(height, layoutHeightRef.current, scrollOffsetRef.current)
    }

    hasMeasuredContentRef.current = true
  }, [messages.length, scrollToEnd, setNearEnd, updateNearEnd])

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    layoutHeightRef.current = event.nativeEvent.layout.height
    updateNearEnd(contentHeightRef.current, layoutHeightRef.current, scrollOffsetRef.current)

    if (isNearEndRef.current) {
      scrollToEnd(false)
    }
  }, [scrollToEnd, updateNearEnd])

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent
    contentHeightRef.current = contentSize.height
    layoutHeightRef.current = layoutMeasurement.height
    scrollOffsetRef.current = contentOffset.y
    updateNearEnd(contentSize.height, layoutMeasurement.height, contentOffset.y)
  }, [updateNearEnd])

  const handleJumpToLatest = useCallback(() => {
    hapticButton()
    setNearEnd(true)
    scrollToEnd(true)
  }, [scrollToEnd, setNearEnd])

  const renderMessage = useCallback(
    ({ item }: ListRenderItemInfo<Message>) => <MessageBubble message={item} />,
    [],
  )

  const renderEmptyState = useCallback(
    () => <EmptyState onSuggestion={onSuggestion} />,
    [onSuggestion],
  )

  return (
    <View style={styles.messageListWrap}>
      <FlatList
        ref={listRef}
        accessibilityLabel="Chat messages"
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        ListEmptyComponent={renderEmptyState}
        onContentSizeChange={handleContentSizeChange}
        onLayout={handleLayout}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        style={styles.messageList}
        contentContainerStyle={[
          styles.messagesContent,
          messages.length === 0 ? styles.messagesContentEmpty : null,
        ]}
      />
      {messages.length > 0 && !isNearEnd ? (
        <Pressable
          accessibilityLabel="Jump to latest message"
          accessibilityRole="button"
          hitSlop={8}
          onPress={handleJumpToLatest}
          style={({ pressed }) => [styles.latestMessageButton, pressed ? styles.pressed : null]}
        >
          <Text style={styles.latestMessageButtonText}>{'Latest \u2193'}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}
