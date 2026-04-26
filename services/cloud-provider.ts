import Constants from 'expo-constants'
import {
  OpenAIProvider,
  type CompletionResponse,
  type Message as SdkMessage,
  type Provider,
} from '@jeffs-brain/memory-react-native'

import { GeminiProvider } from './gemini-provider'

const extra = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined

const envValue = (key: string): string | undefined => process.env[key] ?? extra?.[key]
const firstEnvValue = (keys: readonly string[]): string | undefined => {
  for (const key of keys) {
    const value = envValue(key)?.trim()
    if (value !== undefined && value !== '') return value
  }
  return undefined
}

const cloudUrl = (): string | undefined => envValue('EXPO_PUBLIC_GEMMA_CLOUD_URL')?.trim()
const cloudApiKey = (): string | undefined => envValue('EXPO_PUBLIC_GEMMA_CLOUD_API_KEY')?.trim()
const cloudModel = (): string => envValue('EXPO_PUBLIC_GEMMA_CLOUD_MODEL')?.trim() || 'gemma-4-31B-it'
const geminiApiKey = (): string | undefined => firstEnvValue([
  'GOOGLE_GENERATIVE_AI_API_KEY',
  'EXPO_PUBLIC_GOOGLE_GENERATIVE_AI_API_KEY',
])
const geminiModel = (): string => firstEnvValue([
  'GOOGLE_GENERATIVE_AI_MODEL',
  'EXPO_PUBLIC_GEMINI_MODEL',
]) ?? 'gemini-2.5-flash'
const geminiEndpoint = (): string | undefined => firstEnvValue([
  'GOOGLE_GENERATIVE_AI_ENDPOINT',
  'EXPO_PUBLIC_GEMINI_ENDPOINT',
])

const normaliseBaseUrl = (url: string): string =>
  url.replace(/\/+$/, '').replace(/\/v1$/i, '')

let provider: Provider | null = null
let providerKey: string | null = null

const getProvider = (): Provider | null => {
  const googleKey = geminiApiKey()
  if (googleKey !== undefined) {
    const model = geminiModel()
    const endpoint = geminiEndpoint()
    const key = `gemini|${googleKey}|${model}|${endpoint ?? ''}`
    if (provider !== null && providerKey === key) return provider

    provider = new GeminiProvider({
      apiKey: googleKey,
      model,
      ...(endpoint === undefined ? {} : { endpoint }),
    })
    providerKey = key
    return provider
  }

  const url = cloudUrl()
  const apiKey = cloudApiKey()
  if (url === undefined || url === '' || apiKey === undefined || apiKey === '') return null
  const model = cloudModel()
  const key = `openai-compatible|${url}|${apiKey}|${model}`
  if (provider !== null && providerKey === key) return provider

  provider = new OpenAIProvider({
    apiKey,
    baseURL: normaliseBaseUrl(url),
    defaultMaxTokens: 1024,
    model,
  })
  providerKey = key
  return provider
}

export const cloudProviderService = {
  isConfigured(): boolean {
    return getProvider() !== null
  },

  modelName(): string {
    return getProvider()?.modelName() ?? geminiModel()
  },

  async complete(
    messages: readonly SdkMessage[],
    system: string,
    signal: AbortSignal,
  ): Promise<CompletionResponse> {
    const selected = getProvider()
    if (selected === null) {
      throw new Error('Cloud provider is not configured.')
    }

    return selected.complete({
      messages,
      system,
      maxTokens: 1024,
      temperature: 0.4,
    }, signal)
  },
}
