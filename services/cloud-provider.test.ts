import { describe, expect, it } from 'bun:test'
import * as BunTest from 'bun:test'

type MockModule = (path: string, factory: () => unknown) => void

const mockModule = (BunTest as unknown as { readonly mock: { readonly module: MockModule } }).mock.module

mockModule('expo-constants', () => ({
  default: { expoConfig: { extra: {} } },
}))

mockModule('@jeffs-brain/memory-react-native', () => ({
  OpenAIProvider: class MockOpenAIProvider {
    private readonly model: string

    constructor(config: { readonly model?: string }) {
      this.model = config.model ?? 'mock-openai'
    }

    name(): string {
      return 'openai-compatible'
    }

    modelName(): string {
      return this.model
    }

    supportsStructuredDecoding(): boolean {
      return false
    }

    async complete(): Promise<{
      readonly content: string
      readonly toolCalls: []
      readonly usage: { readonly inputTokens: number; readonly outputTokens: number }
      readonly stopReason: ''
    }> {
      return {
        content: 'legacy selected',
        toolCalls: [],
        usage: { inputTokens: 0, outputTokens: 0 },
        stopReason: '',
      }
    }
  },
}))

type FetchCall = {
  readonly url: string
  readonly init: RequestInit
}

const ENV_KEYS = [
  'GOOGLE_GENERATIVE_AI_API_KEY',
  'GOOGLE_GENERATIVE_AI_MODEL',
  'GOOGLE_GENERATIVE_AI_ENDPOINT',
  'EXPO_PUBLIC_GOOGLE_GENERATIVE_AI_API_KEY',
  'EXPO_PUBLIC_GEMINI_MODEL',
  'EXPO_PUBLIC_GEMINI_ENDPOINT',
  'EXPO_PUBLIC_GEMMA_CLOUD_URL',
  'EXPO_PUBLIC_GEMMA_CLOUD_API_KEY',
  'EXPO_PUBLIC_GEMMA_CLOUD_MODEL',
] as const

type EnvKey = typeof ENV_KEYS[number]

const originalFetch = globalThis.fetch
const originalEnv = ENV_KEYS.reduce<Record<EnvKey, string | undefined>>((values, key) => {
  values[key] = process.env[key]
  return values
}, {
  GOOGLE_GENERATIVE_AI_API_KEY: undefined,
  GOOGLE_GENERATIVE_AI_MODEL: undefined,
  GOOGLE_GENERATIVE_AI_ENDPOINT: undefined,
  EXPO_PUBLIC_GOOGLE_GENERATIVE_AI_API_KEY: undefined,
  EXPO_PUBLIC_GEMINI_MODEL: undefined,
  EXPO_PUBLIC_GEMINI_ENDPOINT: undefined,
  EXPO_PUBLIC_GEMMA_CLOUD_URL: undefined,
  EXPO_PUBLIC_GEMMA_CLOUD_API_KEY: undefined,
  EXPO_PUBLIC_GEMMA_CLOUD_MODEL: undefined,
})
const fetchCalls: FetchCall[] = []

const service = async (): Promise<typeof import('./cloud-provider').cloudProviderService> =>
  (await import('./cloud-provider')).cloudProviderService

const clearProviderEnv = (): void => {
  for (const key of ENV_KEYS) {
    delete process.env[key]
  }
}

const restoreEnv = (): void => {
  clearProviderEnv()
  for (const key of ENV_KEYS) {
    const value = originalEnv[key]
    if (value !== undefined) process.env[key] = value
  }
}

const restoreFetch = (): void => {
  Object.assign(globalThis, { fetch: originalFetch })
  fetchCalls.length = 0
}

const mockFetch = (handler: (url: string, init: RequestInit) => Response | Promise<Response>): void => {
  restoreFetch()
  Object.assign(globalThis, {
    fetch: (async (input: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      const requestInit = init ?? {}
      fetchCalls.push({ url, init: requestInit })
      return await handler(url, requestInit)
    }) satisfies typeof fetch,
  })
}

const withRestoredEnvironment = async (run: () => Promise<void>): Promise<void> => {
  try {
    await run()
  } finally {
    restoreFetch()
    restoreEnv()
  }
}

describe('cloudProviderService', () => {
  it('reports unconfigured when no cloud credentials are available', async () => withRestoredEnvironment(async () => {
    clearProviderEnv()
    const cloudProviderService = await service()

    expect(cloudProviderService.isConfigured()).toEqual(false)
    expect(cloudProviderService.modelName()).toEqual('gemini-2.5-flash')
  }))

  it('prefers Gemini over the legacy OpenAI-compatible provider', async () => withRestoredEnvironment(async () => {
    clearProviderEnv()
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test-gemini-key'
    process.env.GOOGLE_GENERATIVE_AI_MODEL = 'gemini-test'
    process.env.EXPO_PUBLIC_GEMMA_CLOUD_URL = 'https://legacy.example/v1'
    process.env.EXPO_PUBLIC_GEMMA_CLOUD_API_KEY = 'legacy-key'
    process.env.EXPO_PUBLIC_GEMMA_CLOUD_MODEL = 'legacy-model'
    mockFetch((_url, init) => {
      expect(new Headers(init.headers).get('x-goog-api-key')).toEqual('test-gemini-key')
      return new Response(JSON.stringify({
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Gemini selected' }] } }],
      }))
    })

    const cloudProviderService = await service()

    expect(cloudProviderService.isConfigured()).toEqual(true)
    expect(cloudProviderService.modelName()).toEqual('gemini-test')
    const response = await cloudProviderService.complete(
      [{ role: 'user', content: 'Hello' }],
      'Be useful.',
      new AbortController().signal,
    )

    expect(fetchCalls[0]?.url).toEqual(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent',
    )
    expect(response.content).toEqual('Gemini selected')
  }))

  it('uses public Gemini endpoint and model overrides for dev-client demos', async () => withRestoredEnvironment(async () => {
    clearProviderEnv()
    process.env.EXPO_PUBLIC_GOOGLE_GENERATIVE_AI_API_KEY = 'public-test-key'
    process.env.EXPO_PUBLIC_GEMINI_MODEL = 'models/gemini-public-test'
    process.env.EXPO_PUBLIC_GEMINI_ENDPOINT = 'https://gemini.example/v1beta/'
    mockFetch(() => new Response(JSON.stringify({
      candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Endpoint selected' }] } }],
    })))

    const cloudProviderService = await service()

    expect(cloudProviderService.modelName()).toEqual('models/gemini-public-test')
    await cloudProviderService.complete(
      [{ role: 'user', content: 'Hello' }],
      'Be useful.',
      new AbortController().signal,
    )

    expect(fetchCalls[0]?.url).toEqual('https://gemini.example/v1beta/models/gemini-public-test:generateContent')
  }))
})
