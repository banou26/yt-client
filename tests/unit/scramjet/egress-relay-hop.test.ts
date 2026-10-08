import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import type { EgressApi } from '../../../src/scramjet/protocol'

import { EGRESS_KEY } from '../../../src/scramjet/protocol'
import { RELAY_NONCE_HEADER } from '../../../src/scramjet/relay-nonce'

const fetchWithFkn = vi.fn(async (_url: string, _init: RequestInit) => new Response('{}', { status: 200 }))
const expose = vi.fn()

vi.mock('@fkn/lib', () => ({ fetch: fetchWithFkn }))
vi.mock('@fkn/lib/net', () => ({ connect: () => ({ on: () => {}, write: () => {}, destroy: () => {} }) }))
vi.mock('osra', () => ({ expose }))
vi.mock('libcurl.js/bundled', () => ({ libcurl: { load_wasm: async () => {}, set_websocket: () => {} } }))

// the worker exposes its api only once the engine hands it a port, so this plays the engine
const exposedApi = async () => {
  const listeners: ((event: { data: unknown }) => void)[] = []
  vi.stubGlobal('self', { addEventListener: (_type: string, listener: (event: { data: unknown }) => void) => listeners.push(listener) })
  await import('../../../src/scramjet/egress.worker')
  for (const listener of listeners) listener({ data: { type: EGRESS_KEY, port: { start: () => {}, close: () => {} } } })
  return expose.mock.lastCall![0] as EgressApi
}

const sentHeaders = () => fetchWithFkn.mock.calls.map(([, init]) => init.headers as Record<string, string> | undefined)

describe('the egress worker relay hop', () => {
  beforeEach(() => {
    vi.resetModules()
    fetchWithFkn.mockClear()
    expose.mockClear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends the session bootstrap to the relay with a new nonce each time', async () => {
    const api = await exposedApi()
    await api.fknFetch('https://www.youtube.com/sw.js_data', { method: 'GET' })
    await api.fknFetch('https://www.youtube.com/sw.js_data', { method: 'GET' })
    const [first, second] = sentHeaders().map((headers) => headers?.[RELAY_NONCE_HEADER])
    expect(first).toMatch(/^[0-9a-f-]{36}$/)
    expect(second).toMatch(/^[0-9a-f-]{36}$/)
    expect(first).not.toBe(second)
  })

  it('sends a shared read to the relay unchanged', async () => {
    const api = await exposedApi()
    await api.fknFetch('https://www.youtube.com/iframe_api', { method: 'GET', headers: { accept: '*/*' } })
    expect(sentHeaders()).toEqual([{ accept: '*/*' }])
  })
})
