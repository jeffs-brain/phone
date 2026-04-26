import { describe, expect, it } from 'bun:test'

import { sanitiseModelResponse } from './response-sanitizer'

describe('sanitiseModelResponse', () => {
  it('keeps normal answers untouched', () => {
    expect(sanitiseModelResponse('Hello there.')).toEqual({
      content: 'Hello there.',
      thinking: '',
    })
  })

  it('moves Gemma channel thoughts out of visible content', () => {
    expect(sanitiseModelResponse('<|channel|>thought\nscratchpad\n<|channel|>final\nVisible answer.')).toEqual({
      content: 'Visible answer.',
      thinking: 'scratchpad',
    })
  })

  it('moves think tags out of visible content', () => {
    expect(sanitiseModelResponse('<think>private notes</think>\nFinal answer')).toEqual({
      content: 'Final answer',
      thinking: 'private notes',
    })
  })

  it('keeps native reasoning content separate', () => {
    expect(sanitiseModelResponse('Final answer', 'native reasoning')).toEqual({
      content: 'Final answer',
      thinking: 'native reasoning',
    })
  })
})
