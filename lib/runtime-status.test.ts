import { describe, expect, it } from 'bun:test'

import {
  ACTIVE_GENERATION_STATUSES,
  BUSY_MODEL_STATUSES,
  isGenerationActive,
  isModelActivityStatus,
} from './runtime-status'

describe('runtime status helpers', () => {
  it('treats done, idle, and error generation states as inactive', () => {
    expect(isGenerationActive('idle')).toEqual(false)
    expect(isGenerationActive('done')).toEqual(false)
    expect(isGenerationActive('error')).toEqual(false)
  })

  it('covers every active generation state used by the app', () => {
    expect(ACTIVE_GENERATION_STATUSES.map((status) => [status, isGenerationActive(status)])).toEqual([
      ['routing', true],
      ['preparing-vision', true],
      ['checking-vision', true],
      ['downloading-vision', true],
      ['verifying-vision', true],
      ['initialising-vision', true],
      ['loading-first-token', true],
      ['thinking', true],
      ['using-tools', true],
      ['streaming', true],
    ])
  })

  it('marks model download and initialisation states as busy', () => {
    expect(BUSY_MODEL_STATUSES.map((status) => [status, isModelActivityStatus(status)])).toEqual([
      ['checking', true],
      ['downloading', true],
      ['verifying', true],
      ['loaded', true],
      ['initialised', true],
    ])
    expect(isModelActivityStatus('ready')).toEqual(false)
    expect(isModelActivityStatus('error')).toEqual(false)
  })
})
