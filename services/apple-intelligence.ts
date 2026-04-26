import { Platform } from 'react-native'
import { requireOptionalNativeModule } from 'expo-modules-core'

import type { ContentPart } from '../store/types'

type AppleFoundationAvailability = {
  readonly available: boolean
  readonly reason: string | null
  readonly contextSize: number | null
}

export type AppleImageAnalysis = {
  readonly text: readonly string[]
  readonly labels: readonly {
    readonly identifier: string
    readonly confidence: number
  }[]
}

export type ApplePdfText = {
  readonly text: string
  readonly pageCount: number
}

type AppleFoundationMessage = {
  readonly role: 'user' | 'assistant' | 'system'
  readonly content: string
}

export type AppleFoundationTextRequest = {
  readonly instructions: string
  readonly messages: readonly AppleFoundationMessage[]
  readonly maxTokens?: number
}

type AppleIntelligenceNativeModule = {
  readonly getFoundationAvailability: () => Promise<AppleFoundationAvailability>
  readonly generateFoundationText: (request: AppleFoundationTextRequest) => Promise<string>
  readonly analyseImage: (uri: string) => Promise<AppleImageAnalysis>
  readonly extractPdfText: (uri: string) => Promise<ApplePdfText>
}

const nativeModule = (): AppleIntelligenceNativeModule | null => {
  if (Platform.OS !== 'ios') return null
  return requireOptionalNativeModule<AppleIntelligenceNativeModule>('JeffAppleIntelligence')
}

const missingModuleError = (): Error =>
  new Error('Apple Intelligence native module is not linked. Rebuild the iOS dev client to enable Apple Foundation Models, Apple Vision, and local PDF extraction.')

const messageText = (parts: readonly ContentPart[]): string =>
  parts
    .filter((part): part is Extract<ContentPart, { type: 'text' | 'file' }> =>
      part.type === 'text' || part.type === 'file',
    )
    .map((part) => part.type === 'text' ? part.text : `${part.name}\n\n${part.text}`)
    .join('\n\n')
    .trim()

export const appleIntelligenceService = {
  async foundationAvailability(): Promise<AppleFoundationAvailability> {
    const module = nativeModule()
    if (module === null) {
      return {
        available: false,
        reason: Platform.OS === 'ios' ? 'native-module-missing' : 'ios-only',
        contextSize: null,
      }
    }
    return module.getFoundationAvailability()
  },

  async generateText(request: AppleFoundationTextRequest): Promise<string> {
    const module = nativeModule()
    if (module === null) throw missingModuleError()
    return module.generateFoundationText(request)
  },

  async analyseImage(uri: string): Promise<AppleImageAnalysis> {
    const module = nativeModule()
    if (module === null) throw missingModuleError()
    return module.analyseImage(uri)
  },

  async extractPdfText(uri: string): Promise<ApplePdfText> {
    const module = nativeModule()
    if (module === null) throw missingModuleError()
    return module.extractPdfText(uri)
  },

  buildTextMessages(messages: readonly {
    readonly role: 'user' | 'assistant' | 'system' | 'tool'
    readonly parts: readonly ContentPart[]
  }[]): AppleFoundationMessage[] {
    return messages
      .filter((message): message is {
        readonly role: 'user' | 'assistant' | 'system'
        readonly parts: readonly ContentPart[]
      } => message.role !== 'tool')
      .map((message): AppleFoundationMessage => ({
        role: message.role,
        content: messageText(message.parts),
      }))
      .filter((message) => message.content !== '')
  },
}
