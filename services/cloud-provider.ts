import Constants from 'expo-constants'
import {
  OpenAIProvider,
  type CompletionResponse,
  type Message as SdkMessage,
  type Provider,
} from '@jeffs-brain/memory-react-native'

const extra = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined

const envValue = (key: string): string | undefined => process.env[key] ?? extra?.[key]

const cloudUrl = (): string | undefined => envValue('EXPO_PUBLIC_GEMMA_CLOUD_URL')?.trim()
const cloudApiKey = (): string | undefined => envValue('EXPO_PUBLIC_GEMMA_CLOUD_API_KEY')?.trim()
const cloudModel = (): string => envValue('EXPO_PUBLIC_GEMMA_CLOUD_MODEL')?.trim() || 'gemma-4-31B-it'

const normaliseBaseUrl = (url: string): string =>
  url.replace(/\/+$/, '').replace(/\/v1$/i, '')

let provider: Provider | null = null
let providerKey: string | null = null

const getProvider = (): Provider | null => {
  const url = cloudUrl()
  const apiKey = cloudApiKey()
  if (url === undefined || url === '' || apiKey === undefined || apiKey === '') return null

  const model = cloudModel()
  const key = `${url}|${apiKey}|${model}`
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
    return cloudModel()
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
