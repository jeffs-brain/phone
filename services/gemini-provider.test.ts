import { describe, expect, it } from 'bun:test'

import { GeminiProvider } from './gemini-provider'

type FetchCall = {
  readonly url: string
  readonly init: RequestInit
}

const originalFetch = globalThis.fetch
const fetchCalls: FetchCall[] = []

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

const expectRejectsWith = async (promise: Promise<unknown>, expected: string): Promise<void> => {
  try {
    await promise
  } catch (error) {
    expect((error instanceof Error ? error.message : String(error)).includes(expected)).toEqual(true)
    return
  }

  throw new Error(`Expected promise to reject with "${expected}".`)
}

const requestBody = (): Record<string, unknown> => {
  const body = fetchCalls[0]?.init.body
  if (typeof body !== 'string') throw new Error('Expected JSON request body.')
  const parsed: unknown = JSON.parse(body)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Expected JSON object request body.')
  }
  return parsed as Record<string, unknown>
}

const withRestoredFetch = async (run: () => Promise<void>): Promise<void> => {
  try {
    await run()
  } finally {
    restoreFetch()
  }
}

describe('GeminiProvider', () => {
  it('sends Gemini generateContent requests and parses text responses', async () => withRestoredFetch(async () => {
    mockFetch((_url, init) => {
      expect(new Headers(init.headers).get('x-goog-api-key')).toEqual('test-key')
      return new Response(JSON.stringify({
        candidates: [{
          finishReason: 'STOP',
          content: {
            parts: [{ text: 'Cloud answer' }],
          },
        }],
        usageMetadata: {
          promptTokenCount: 12,
          candidatesTokenCount: 5,
          cachedContentTokenCount: 2,
        },
      }))
    })

    const provider = new GeminiProvider({ apiKey: 'test-key', model: 'gemini-test' })
    const response = await provider.complete({
      system: 'Be useful.',
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
        { role: 'user', content: 'Help me' },
      ],
      maxTokens: 128,
      temperature: 0.2,
    })

    expect(fetchCalls[0]?.url).toEqual(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent',
    )
    expect(response).toEqual({
      content: 'Cloud answer',
      toolCalls: [],
      usage: {
        inputTokens: 12,
        outputTokens: 5,
        cacheReadTokens: 2,
      },
      stopReason: 'end_turn',
    })
    expect(requestBody()).toEqual({
      contents: [
        { role: 'user', parts: [{ text: 'Hello' }] },
        { role: 'model', parts: [{ text: 'Hi' }] },
        { role: 'user', parts: [{ text: 'Help me' }] },
      ],
      systemInstruction: {
        parts: [{ text: 'Be useful.' }],
      },
      generationConfig: {
        maxOutputTokens: 128,
        temperature: 0.2,
      },
    })
  }))

  it('keeps consecutive same-role turns valid for Gemini', async () => withRestoredFetch(async () => {
    mockFetch(() => new Response(JSON.stringify({
      candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'ok' }] } }],
    })))

    const provider = new GeminiProvider({ apiKey: 'test-key', model: 'gemini-test' })
    await provider.complete({
      messages: [
        { role: 'user', content: 'First' },
        { role: 'user', content: 'Second' },
      ],
    })

    expect(requestBody().contents).toEqual([
      { role: 'user', parts: [{ text: 'First\n\nSecond' }] },
    ])
  }))

  it('uses Gemini structured JSON mode for structured requests', async () => withRestoredFetch(async () => {
    mockFetch(() => new Response(JSON.stringify({
      candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"answer":"yes"}' }] } }],
    })))

    const provider = new GeminiProvider({ apiKey: 'test-key', model: 'gemini-test' })
    const content = await provider.structured({
      messages: [{ role: 'user', content: 'Return JSON' }],
      schema: JSON.stringify({
        type: 'object',
        properties: { answer: { type: 'string' } },
        required: ['answer'],
      }),
    })

    expect(content).toEqual('{"answer":"yes"}')
    expect(requestBody().generationConfig).toEqual({
      maxOutputTokens: 2048,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object',
        properties: { answer: { type: 'string' } },
        required: ['answer'],
      },
    })
  }))

  it('throws clear errors for failed or blocked Gemini responses', async () => withRestoredFetch(async () => {
    mockFetch(() => new Response(JSON.stringify({
      promptFeedback: { blockReason: 'SAFETY' },
    })))

    const provider = new GeminiProvider({ apiKey: 'test-key', model: 'gemini-test' })
    await expectRejectsWith(provider.complete({
      messages: [{ role: 'user', content: 'Blocked prompt' }],
    }), 'gemini: prompt blocked (SAFETY)')

    mockFetch(() => new Response('{"error":{"message":"bad key"}}', { status: 400 }))
    await expectRejectsWith(provider.complete({
      messages: [{ role: 'user', content: 'Hello' }],
    }), 'gemini: request failed with status 400')
  }))

  it('fails stalled requests with a clear timeout', async () => withRestoredFetch(async () => {
    mockFetch((_url, init) => new Promise<Response>((resolve, reject) => {
      const signal = init.signal instanceof AbortSignal ? init.signal : undefined
      signal?.addEventListener('abort', () => {
        reject(new DOMException('Aborted', 'AbortError'))
      }, { once: true })
      setTimeout(() => {
        resolve(new Response(JSON.stringify({
          candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'late' }] } }],
        })))
      }, 25)
    }))

    const provider = new GeminiProvider({
      apiKey: 'test-key',
      model: 'gemini-test',
      requestTimeoutMs: 1,
    })

    await expectRejectsWith(provider.complete({
      messages: [{ role: 'user', content: 'Hello' }],
    }), 'gemini: request timed out after 1ms')
  }))
})
