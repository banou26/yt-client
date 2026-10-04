import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

const relayWorker = vi.fn<() => Promise<void>>()

vi.mock('@fkn/lib', () => ({
  FORGEABLE_HEADERS: ['origin', 'referer', 'cookie'],
  extension: { fetch: async () => new Response(null) },
  isExtensionExposed: () => false,
  promptInstall: async () => false,
  relayWorker,
  setMissingExtensionHandler: () => {},
}))

// the broker iframe loads as soon as it is appended, and the egress worker is inert
const installWindow = () => {
  vi.stubGlobal('Worker', class {
    postMessage() {}
    terminate() {}
  })
  vi.stubGlobal('window', { addEventListener: () => {} })
  vi.stubGlobal('document', {
    createElement: () => {
      const listeners = new Map<string, () => void>()
      return { addEventListener: (type: string, listener: () => void) => listeners.set(type, listener), listeners }
    },
    body: { appendChild: (element: { listeners: Map<string, () => void> }) => element.listeners.get('load')?.() },
  })
}

describe('starting the platform', () => {
  beforeEach(() => {
    vi.resetModules()
    relayWorker.mockReset()
    installWindow()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // @fkn/lib 0.9.13 made relayWorker async, and it rejects when the realm has no FKN transport; the real lib rejects again on a retry, so this pins only that the failure is not memoized
  it('fails the start when the worker cannot be relayed, without memoizing the failure', async () => {
    relayWorker.mockRejectedValue(new Error('FKN @fkn/lib: relayWorker found no FKN transport in this realm'))
    const { startPlatform } = await import('../../../src/scramjet/platform')
    await expect(startPlatform()).rejects.toThrow(/no FKN transport/)
    await expect(startPlatform()).rejects.toThrow(/no FKN transport/)
    expect(relayWorker).toHaveBeenCalledTimes(2)
  })

  it('starts once the worker is relayed', async () => {
    relayWorker.mockResolvedValue(undefined)
    const { startPlatform } = await import('../../../src/scramjet/platform')
    const platform = await startPlatform()
    expect(Object.keys(platform).sort()).toEqual(['abortEgress', 'openEgressPort', 'openExtFetchPort', 'promptInstall'])
    expect(relayWorker).toHaveBeenCalledTimes(1)
  })
})
