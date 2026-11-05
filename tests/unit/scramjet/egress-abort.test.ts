import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import type { EgressApi } from '../../../src/scramjet/protocol'

import { EGRESS_ABORT_ALL, EGRESS_KEY } from '../../../src/scramjet/protocol'

const expose = vi.fn()

// a libcurl.js transfer as libcurl.js 0.7.4 and 0.7.5 run one: `answer` settles fetch the way the first body byte does,
// an abort before that rejects it, and `abortedEarly` records that abort, the one a late first byte turns into a read of
// a null handle (0.7.4 traps the wasm, 0.7.5 reads a garbage status)
type Transfer = { signal: AbortSignal, answer(): void, abortedEarly: boolean }
const transfers: Transfer[] = []
const libcurlFetch = vi.fn((_url: string, options: { signal: AbortSignal }) => new Promise<Response>((resolve, reject) => {
  let answered = false
  const transfer: Transfer = {
    signal: options.signal,
    abortedEarly: false,
    answer: () => {
      answered = true
      resolve(new Response(new ReadableStream({ start() {} }), { status: 200 }))
    },
  }
  options.signal.addEventListener('abort', () => {
    if (answered) return
    transfer.abortedEarly = true
    reject(new DOMException('The operation was aborted.'))
  }, { once: true })
  transfers.push(transfer)
}))

vi.mock('@fkn/lib', () => ({ fetch: vi.fn() }))
vi.mock('@fkn/lib/net', () => ({ connect: () => ({ on: () => {}, write: () => {}, destroy: () => {} }) }))
vi.mock('osra', () => ({ expose }))
vi.mock('libcurl.js/bundled', () => ({ libcurl: { load_wasm: async () => {}, set_websocket: () => {}, fetch: libcurlFetch } }))

const loadWorker = async () => {
  const listeners: ((event: { data: unknown }) => void)[] = []
  vi.stubGlobal('self', { addEventListener: (_type: string, listener: (event: { data: unknown }) => void) => listeners.push(listener) })
  await import('../../../src/scramjet/egress.worker')
  const post = (data: unknown) => { for (const listener of listeners) listener({ data }) }
  post({ type: EGRESS_KEY, port: { start: () => {}, close: () => {} } })
  return { post, egress: expose.mock.lastCall![0] as EgressApi }
}

const SEGMENT = 'https://rr1.googlevideo.com/videoplayback'

describe('the egress worker aborting a libcurl transfer', () => {
  beforeEach(() => {
    vi.resetModules()
    expose.mockClear()
    libcurlFetch.mockClear()
    transfers.length = 0
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('answers a cancel before the response at once, and aborts the transfer only once it answered', async () => {
    const { egress } = await loadWorker()
    const request = egress.libcurlFetch('frame:1:1', SEGMENT, { method: 'POST' })
    await vi.waitFor(() => expect(transfers).toHaveLength(1))
    await egress.cancelLibcurlFetch('frame:1:1')
    await expect(request).rejects.toThrow()
    expect(transfers[0]!.abortedEarly).toBe(false)
    transfers[0]!.answer()
    await vi.waitFor(() => expect(transfers[0]!.signal.aborted).toBe(true))
  })

  it('does the same on an engine reset', async () => {
    const { egress, post } = await loadWorker()
    const request = egress.libcurlFetch('frame:1:2', SEGMENT, { method: 'POST' })
    await vi.waitFor(() => expect(transfers).toHaveLength(1))
    post({ type: EGRESS_ABORT_ALL })
    await expect(request).rejects.toThrow()
    expect(transfers[0]!.abortedEarly).toBe(false)
    transfers[0]!.answer()
    await vi.waitFor(() => expect(transfers[0]!.signal.aborted).toBe(true))
  })

  it('still aborts a transfer cancelled after it answered', async () => {
    const { egress } = await loadWorker()
    const request = egress.libcurlFetch('frame:1:3', SEGMENT, { method: 'POST' })
    await vi.waitFor(() => expect(transfers).toHaveLength(1))
    transfers[0]!.answer()
    await expect(request).resolves.toMatchObject({ status: 200 })
    await egress.cancelLibcurlFetch('frame:1:3')
    expect(transfers[0]!.signal.aborted).toBe(true)
  })
})
