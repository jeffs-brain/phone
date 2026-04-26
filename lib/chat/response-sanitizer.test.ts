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

  it('moves Gemma 4 thought channels out of visible content', () => {
    expect(sanitiseModelResponse('<|channel>thought\nscratchpad\n<channel|>Visible answer.')).toEqual({
      content: 'Visible answer.',
      thinking: 'scratchpad',
    })
  })

  it('removes response channel control markers from visible content', () => {
    expect(sanitiseModelResponse('<|start|>assistant<|channel|>response<|message|>Visible answer.<|end|>')).toEqual({
      content: 'Visible answer.',
      thinking: '',
    })
  })

  it('moves think tags out of visible content', () => {
    expect(sanitiseModelResponse('<think>private notes</think>\nFinal answer')).toEqual({
      content: 'Final answer',
      thinking: 'private notes',
    })
  })

  it('moves visible Gemma thinking prose out of visible content', () => {
    expect(sanitiseModelResponse([
      'Thinking Process:',
      '1. Check memory.',
      '2. Answer directly.',
      '',
      'Final Answer:',
      'The list is in memory.',
    ].join('\n'))).toEqual({
      content: 'The list is in memory.',
      thinking: 'Thinking Process:\n1. Check memory.\n2. Answer directly.',
    })
  })

  it('handles Gemma markdown final output headings after visible thinking prose', () => {
    expect(sanitiseModelResponse([
      'Thinking Process:',
      '1. Check memory.',
      '',
      '5. **Final Output Generation:**',
      'You bought a lamp.',
    ].join('\n'))).toEqual({
      content: 'You bought a lamp.',
      thinking: 'Thinking Process:\n1. Check memory.',
    })
  })

  it('hides visible Gemma thinking prose when no final answer was produced', () => {
    expect(sanitiseModelResponse('Thinking Process:\n1. Check memory.')).toEqual({
      content: '',
      thinking: 'Thinking Process:\n1. Check memory.',
    })
  })

  it('holds partial visible thinking labels during streaming', () => {
    expect(sanitiseModelResponse('Thinking Pro')).toEqual({
      content: '',
      thinking: '',
    })
  })

  it('keeps native reasoning content separate', () => {
    expect(sanitiseModelResponse('Final answer', 'native reasoning')).toEqual({
      content: 'Final answer',
      thinking: 'native reasoning',
    })
  })
})
