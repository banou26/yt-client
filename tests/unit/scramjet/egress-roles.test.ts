import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import type { EgressApi } from '../../../src/scramjet/protocol'

import { EGRESS_ABORT_ALL, EGRESS_KEY } from '../../../src/scramjet/protocol'

const expose = vi.fn()
// a libcurl request that never answers until it is aborted
const libcurlFetch = vi.fn((_url: string, options: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
  options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
}))

vi.mock('@fkn/lib', () => ({ fetch: vi.fn() }))
vi.mock('@fkn/lib/net', () => ({ connect: () => ({ on: () => {}, write: () => {}, destroy: () => {} }) }))
vi.mock('osra', () => ({ expose }))
vi.mock('libcurl.js/bundled', () => ({ libcurl: { load_wasm: async () => {}, set_websocket: () => {}, fetch: libcurlFetch } }))

type Port = { start: () => void, close: ReturnType<typeof vi.fn> }

const loadWorker = async () => {
  const listeners: ((event: { data: unknown }) => void)[] = []
  vi.stubGlobal('self', { addEventListener: (_type: string, listener: (event: { data: unknown }) => void) => listeners.push(listener) })
  await import('../../../src/scramjet/egress.worker')
  const post = (data: unknown) => { for (const listener of listeners) listener({ data }) }
  const hand = (role?: string): Port => {
    const port = { start: () => {}, close: vi.fn() }
    post({ type: EGRESS_KEY, ...role ? { role } : {}, port })
    return port
  }
  return { post, hand, api: () => expose.mock.lastCall![0] as EgressApi }
}

describe('the egress worker ports', () => {
  beforeEach(() => {
    vi.resetModules()
    expose.mockClear()
    libcurlFetch.mockClear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps the engine port when the sign-in window takes one', async () => {
    const { hand } = await loadWorker()
    const engine = hand()
    const signIn = hand('signin')
    expect(engine.close).not.toHaveBeenCalled()
    expect(signIn.close).not.toHaveBeenCalled()
  })

  it('releases the previous port of the same role', async () => {
    const { hand } = await loadWorker()
    const firstEngine = hand()
    const firstSignIn = hand('signin')
    hand()
    hand('signin')
    expect(firstEngine.close).toHaveBeenCalledOnce()
    expect(firstSignIn.close).toHaveBeenCalledOnce()
  })

  it("leaves the sign-in window's requests alone on an engine reset", async () => {
    const { hand, post, api } = await loadWorker()
    hand()
    const egress = api()
    const engineRequest = egress.libcurlFetch('frame:1:1', 'https://rr1.googlevideo.com/videoplayback', { method: 'GET' })
    const signInRequest = egress.libcurlFetch('signin:1', 'https://accounts.google.com/v3/signin/identifier', { method: 'GET' })
    const signInSettled = vi.fn()
    void signInRequest.then(signInSettled, signInSettled)
    await vi.waitFor(() => expect(libcurlFetch).toHaveBeenCalledTimes(2))
    post({ type: EGRESS_ABORT_ALL })
    await expect(engineRequest).rejects.toThrow('aborted')
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(signInSettled).not.toHaveBeenCalled()
  })
})
