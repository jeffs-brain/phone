import { storeApi } from '../store'

let buffer = ''
let flushHandle: number | null = null
let activeMessageId: string | null = null

const flush = () => {
  flushHandle = null
  if (!buffer || !activeMessageId) return
  const chunk = buffer
  buffer = ''
  storeApi.get().appendStreamingChunk(activeMessageId, chunk)
}

const scheduleFlush = () => {
  if (flushHandle !== null) return
  flushHandle = requestAnimationFrame(flush)
}

export type GenerateOptions = {
  messageId: string
  signal: AbortSignal
}

export const inferenceService = {
  async loadModel(_id: 'gemma-4-E2B' | 'gemma-4-E4B'): Promise<void> {
    // 1. download model + mmproj via expo-file-system, sha256-verify (fix the PoC bug)
    // 2. await initLlama({ model, n_ctx, ctx_shift: false, n_gpu_layers: 99, flash_attn_type: 'auto' })
    // 3. await ctx.initMultimodal({ path: mmprojPath, use_gpu: true })
    // 4. await ctx.parallel.enable({ n_parallel: 4, n_batch: 512 })
  },

  async unloadModel(): Promise<void> {
    // await ctx.releaseMultimodal()
    // await ctx.release()
  },

  async generate(opts: GenerateOptions): Promise<void> {
    activeMessageId = opts.messageId
    storeApi.get().beginAssistantMessage(opts.messageId)
    storeApi.get()._setGenerationStatus('loading-first-token')

    // Pseudo:
    // const req = await ctx.parallel.completion({ messages, tools, tool_choice: 'auto', jinja: true }, (id, data) => {
    //   if (data.token) {
    //     buffer += data.token
    //     scheduleFlush()
    //   }
    //   if (data.tool_calls) {
    //     // emit into chat slice
    //   }
    // })
    // opts.signal.addEventListener('abort', () => req.stop())
    // const result = await req.promise

    flush()
    storeApi.get().commitStreamingMessage(opts.messageId)
    storeApi.get()._setGenerationStatus('done')
    activeMessageId = null
  },
}
