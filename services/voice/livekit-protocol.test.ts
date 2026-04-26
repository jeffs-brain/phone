import { describe, expect, it } from 'bun:test'

import {
  decodeLiveKitVoiceEvent,
  encodeLiveKitVoiceEvent,
} from './livekit-protocol'

describe('livekit voice protocol', () => {
  it('encodes outbound assistant responses', () => {
    const payload = encodeLiveKitVoiceEvent({ type: 'assistant_response', text: 'Hello' })
    expect(new TextDecoder().decode(payload)).toEqual('{"type":"assistant_response","text":"Hello"}')
  })

  it('decodes transcript events', () => {
    const payload = new TextEncoder().encode('{"type":"transcript_final","text":"hello jeff"}')
    expect(decodeLiveKitVoiceEvent(payload)).toEqual({ type: 'transcript_final', text: 'hello jeff' })
  })

  it('rejects malformed or incomplete packets', () => {
    expect(decodeLiveKitVoiceEvent(new TextEncoder().encode('{'))).toEqual(null)
    expect(decodeLiveKitVoiceEvent(new TextEncoder().encode('{"type":"transcript_final"}'))).toEqual(null)
    expect(decodeLiveKitVoiceEvent(new TextEncoder().encode('{"type":"unknown"}'))).toEqual(null)
  })
})
