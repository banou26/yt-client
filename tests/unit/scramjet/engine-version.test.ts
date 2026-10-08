import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { BUILD_ID, ENGINE_BUILD_MISMATCH } from '../../../src/scramjet/engine-build'
import { ENGINE_READY, HOST_BOOTSTRAP, HOST_HELLO } from '../../../src/scramjet/protocol'

vi.mock('../../../src/scramjet/platform', () => ({
  startPlatform: async () => ({
    openEgressPort: () => new MessageChannel().port2,
    openExtFetchPort: () => new MessageChannel().port2,
  }),
  abortPlatformEgress: () => {},
}))

// the host's own boot never gets past its service worker here: these only have to import
vi.mock('@mercuryworkshop/scramjet', () => ({ defaultConfigDev: {}, Tap: { tap: () => {} } }))
vi.mock('@mercuryworkshop/scramjet-controller', () => ({ Controller: class {} }))

const ORIGIN = 'https://youtube.fkn.app'

type Posted = { message: { type?: string, build?: string }, transfer: unknown[] }
type FakeFrame = { contentWindow: { postMessage(message: Posted['message'], origin: string, transfer?: unknown[]): void }, posted: Posted[] }

// just enough of a window for client.ts: one iframe per engine attempt, and the window's message listeners
const installWindow = () => {
  const frames: FakeFrame[] = []
  const listeners = new Set<(event: MessageEvent) => void>()
  const storage = new Map<string, string>()
  const reload = vi.fn()
  vi.stubGlobal('document', {
    createElement: () => {
      const frame: FakeFrame & Record<string, unknown> = {
        posted: [],
        contentWindow: { postMessage: (message, _origin, transfer = []) => frame.posted.push({ message, transfer }) },
        remove: () => {},
        removeAttribute: () => {},
        style: {},
      }
      frames.push(frame)
      return frame
    },
    body: { appendChild: () => {} },
    documentElement: { dataset: {} },
  })
  vi.stubGlobal('window', {
    addEventListener: (_type: string, listener: (event: MessageEvent) => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: (event: MessageEvent) => void) => listeners.delete(listener),
  })
  vi.stubGlobal('location', { origin: ORIGIN, reload })
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value) },
  })
  const fromFrame = (frame: FakeFrame, data: unknown, ports: MessagePort[] = []) => {
    for (const listener of listeners) {
      listener({ origin: ORIGIN, source: frame.contentWindow, data, ports } as unknown as MessageEvent)
    }
  }
  return { frames, reload, fromFrame }
}

// a promise that is still pending after the platform's own awaits have run is reported as such, rather than timing the test out
const settled = <T>(promise: Promise<T>) => Promise.race([
  promise.then((value) => ({ value }), (error: unknown) => ({ error })),
  new Promise<{ pending: true }>((resolve) => setTimeout(() => resolve({ pending: true }), 50)),
])

const bootstraps = (frame: FakeFrame) => frame.posted.filter(({ message }) => message.type === HOST_BOOTSTRAP)

describe('an engine from another build', () => {
  let window: ReturnType<typeof installWindow>

  beforeEach(() => {
    vi.resetModules()
    window = installWindow()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('an app realm from another build reloads once instead of calling a method the frame no longer serves', async () => {
    const { startEngine } = await import('../../../src/scramjet/client')

    const first = startEngine()
    window.fromFrame(window.frames[0]!, { type: HOST_HELLO, build: 'a-later-build' })
    expect(await settled(first)).toEqual({ error: new Error(ENGINE_BUILD_MISMATCH) })
    // no bootstrap means no ports, so no FrameApi exists whose methods could reach the newer frame
    expect(bootstraps(window.frames[0]!)).toEqual([])
    expect(window.reload).toHaveBeenCalledTimes(1)

    // the same pair once more (a cache still serving the old app) fails by name instead of reloading in a loop
    const second = startEngine()
    window.fromFrame(window.frames[1]!, { type: HOST_HELLO, build: 'a-later-build' })
    expect(await settled(second)).toEqual({ error: new Error(ENGINE_BUILD_MISMATCH) })
    expect(bootstraps(window.frames[1]!)).toEqual([])
    expect(window.reload).toHaveBeenCalledTimes(1)
  })

  it('a host from before build ids reads as another build', async () => {
    const { startEngine } = await import('../../../src/scramjet/client')
    const engine = startEngine()
    window.fromFrame(window.frames[0]!, { type: HOST_HELLO })
    expect(await settled(engine)).toEqual({ error: new Error(ENGINE_BUILD_MISMATCH) })
    expect(bootstraps(window.frames[0]!)).toEqual([])
    expect(window.reload).toHaveBeenCalledTimes(1)
  })

  it('a host that refuses this realm by name reloads it once as well', async () => {
    const { startEngine } = await import('../../../src/scramjet/client')
    const engine = startEngine()
    window.fromFrame(window.frames[0]!, { type: HOST_HELLO, build: BUILD_ID })
    await settled(engine)
    window.fromFrame(window.frames[0]!, { type: ENGINE_READY, error: ENGINE_BUILD_MISMATCH })
    expect(await settled(engine)).toEqual({ error: new Error(ENGINE_BUILD_MISMATCH) })
    expect(window.reload).toHaveBeenCalledTimes(1)
  })

  it('a host from this build gets its ports with this build named, and nothing reloads', async () => {
    const { startEngine, resetEngine } = await import('../../../src/scramjet/client')
    const engine = startEngine()
    window.fromFrame(window.frames[0]!, { type: HOST_HELLO, build: BUILD_ID })
    expect(await settled(engine)).toEqual({ pending: true })
    const [bootstrap] = bootstraps(window.frames[0]!)
    expect(bootstrap?.message).toEqual({ type: HOST_BOOTSTRAP, build: BUILD_ID })
    expect(bootstrap?.transfer).toHaveLength(2)

    const api = new MessageChannel()
    const control = new MessageChannel()
    window.fromFrame(window.frames[0]!, { type: ENGINE_READY }, [api.port2, control.port2])
    const ready = await settled(engine)
    expect(ready).toHaveProperty('value')
    expect(window.reload).not.toHaveBeenCalled()
    resetEngine()
    api.port1.close()
    control.port1.close()
  })
})

describe('the build id', () => {
  it('names this build', () => {
    expect(BUILD_ID).toMatch(/^[0-9a-f-]{36}$/)
  })
})

describe('the engine host', () => {
  const installHost = () => {
    const toApp: { type?: string, build?: string, error?: string }[] = []
    const listeners = new Set<(event: MessageEvent) => void>()
    const parent = { postMessage: (message: (typeof toApp)[number]) => { toApp.push(message) } }
    vi.stubGlobal('window', {
      parent,
      addEventListener: (type: string, listener: (event: MessageEvent) => void) => { if (type === 'message') listeners.add(listener) },
      removeEventListener: (_type: string, listener: (event: MessageEvent) => void) => { listeners.delete(listener) },
    })
    vi.stubGlobal('location', { origin: ORIGIN })
    vi.stubGlobal('document', { documentElement: { dataset: {} } })
    vi.stubGlobal('navigator', { serviceWorker: { register: () => new Promise(() => {}) } })
    vi.stubGlobal('fetch', () => new Promise(() => {}))
    const fromApp = (data: unknown, ports: MessagePort[]) => {
      for (const listener of listeners) {
        listener({ origin: ORIGIN, source: parent, data, ports } as unknown as MessageEvent)
      }
    }
    return { toApp, fromApp }
  }

  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // Y1 changed the protocol (a third bootstrap port), so a tab from before build ids is another build too
  it.each([
    ['names another build', { type: HOST_BOOTSTRAP, build: 'an-earlier-build' }],
    ['names none, as a tab opened before build ids', { type: HOST_BOOTSTRAP }],
  ])('refuses an app realm that %s, by name and before using its ports', async (_, bootstrap) => {
    const host = installHost()
    await import('../../../src/scramjet/host')
    expect(host.toApp).toEqual([{ type: HOST_HELLO, build: BUILD_ID }])

    const egress = new MessageChannel()
    const extFetch = new MessageChannel()
    let egressClosed = false
    egress.port1.addEventListener('close', () => { egressClosed = true })
    egress.port1.start()
    host.fromApp(bootstrap, [egress.port2, extFetch.port2])
    await vi.waitFor(() => expect(host.toApp).toContainEqual({ type: ENGINE_READY, error: ENGINE_BUILD_MISMATCH }))
    await vi.waitFor(() => expect(egressClosed).toBe(true))
    extFetch.port1.close()
  })

  it('takes the ports of an app realm from this build', async () => {
    const host = installHost()
    await import('../../../src/scramjet/host')
    const egress = new MessageChannel()
    const extFetch = new MessageChannel()
    host.fromApp({ type: HOST_BOOTSTRAP, build: BUILD_ID }, [egress.port2, extFetch.port2])
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(host.toApp.filter(({ type }) => type === ENGINE_READY)).toEqual([])
    egress.port1.close()
    extFetch.port1.close()
  })
})
