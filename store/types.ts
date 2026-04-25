import type { StateCreator } from 'zustand'

import type { ChatSlice } from './slices/chat'
import type { InferenceSlice } from './slices/inference'
import type { MemorySlice } from './slices/memory'
import type { RoutingSlice } from './slices/routing'
import type { SettingsSlice } from './slices/settings'
import type { VoiceSlice } from './slices/voice'

export type Mutators = [
  ['zustand/devtools', never],
  ['zustand/subscribeWithSelector', never],
  ['zustand/persist', unknown],
]

export type RootState = InferenceSlice
  & ChatSlice
  & VoiceSlice
  & MemorySlice
  & RoutingSlice
  & SettingsSlice

export type Slice<T> = StateCreator<RootState, Mutators, [], T>

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; uri: string; name?: string; mimeType?: string; width?: number; height?: number }
  | { type: 'audio'; uri: string; durationMs: number; name?: string; mimeType?: string }

export type ToolCall = {
  id: string
  name: string
  args: unknown
  status: 'pending' | 'running' | 'done' | 'error'
  result?: unknown
  error?: string
}

export type AssistantThinkingState = {
  text: string
  status: 'streaming' | 'done'
}

export type Message = {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  parts: ContentPart[]
  routeDecision?: RouteDecision
  thinking?: AssistantThinkingState
  toolCalls?: ToolCall[]
  createdAt: number
  // Set only on the in-flight assistant message; cleared on commit.
  streamingText?: string
}

export type GenerationStatus =
  | 'idle'
  | 'loading-first-token'
  | 'thinking'
  | 'using-tools'
  | 'streaming'
  | 'done'
  | 'error'

export type ProviderId = 'gemma-local' | 'apple-fm' | 'cloud'
export type Tier = 'small' | 'medium' | 'large'

export type RouteDecision = {
  tier: Tier
  provider: ProviderId
  label: string
  confidence: number
  latencyMs: number
  routed: boolean // false when we fell back to user's selected provider
}
