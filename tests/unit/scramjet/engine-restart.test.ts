import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { FRAME_AGENT_CONNECT, FRAME_CONNECT, FRAME_DIRECT_CONNECT, FRAME_EGRESS_CONNECT } from '../../../src/frame/protocol'
import { ENGINE_READY, HOST_BOOTSTRAP, HOST_HELLO, HOST_RESTART } from '../../../src/scramjet/protocol'
import { BUILD, querySelector } from '../fixtures/build-tag'

vi.mock('../../../src/scramjet/platform', () => ({
  startPlatform: async () => ({
    openEgressPort: () => new MessageChannel().port2,
    openExtFetchPort: () => new MessageChannel().port2,
  }),
  abortPlatformEgress: () => {},
}))

vi.mock('../../../src/engine/agent-host', () => ({
  startAgentHost: () => {},
  openAgentBridge: () => new MessageChannel().port2,
}))

// enough of Scramjet for the host to reach its frame's init hook, and to count the frame's navigations
const scramjet = vi.hoisted(() => ({ initHook: undefined as undefined | ((context: unknown) => void), visits: [] as string[] }))
vi.mock('@mercuryworkshop/scramjet', () => ({
  defaultConfigDev: {},
  Tap: { tap: (_hook: unknown, callback: (context: unknown) => void) => { scramjet.initHook = callback } },
}))
vi.mock('@mercuryworkshop/scramjet-controller', () => ({
  Controller: class {
    async wait() {}
    createFrame() {
      return { id: 1, hooks: { init: { post: {} } }, go: (url: string) => { scramjet.visits.push(url) } }
    }
  },
}))
vi.mock('../../../src/scramjet/fkn-transport', () => ({
  FRAME_BOOTSTRAP_URL: 'https://www.youtube.com/__yt_client__/frame',
  createFknTransport: () => ({ init: async () => {} }),
}))

const ORIGIN = 'https://youtube.fkn.app'

const open: MessagePort[] = []
const channel = () => {
  const made = new MessageChannel()
  open.push(made.port1, made.port2)
  return made
}

type Posted = { message: { type?: string, build?: string, direct?: boolean }, transfer: unknown[] }
type FakeFrame = { contentWindow: { postMessage(message: Posted['message'], origin: string, transfer?: unknown[]): void }, posted: Posted[], removed: boolean }

// the app realm: one iframe per host, and the window's message listeners
const installAppRealm = () => {
  const frames: FakeFrame[] = []
  const listeners = new Set<(event: MessageEvent) => void>()
  const reload = vi.fn()
  vi.stubGlobal('document', {
    createElement: () => {
      const frame: FakeFrame & Record<string, unknown> = {
        posted: [],
        removed: false,
        contentWindow: { postMessage: (message, _origin, transfer = []) => frame.posted.push({ message, transfer }) },
        remove: () => { frame.removed = true },
        style: {},
      }
      frames.push(frame)
      return frame
    },
    body: { appendChild: () => {} },
    documentElement: { dataset: {} },
    querySelector,
  })
  vi.stubGlobal('window', {
    addEventListener: (_type: string, listener: (event: MessageEvent) => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: (event: MessageEvent) => void) => listeners.delete(listener),
  })
  vi.stubGlobal('location', { origin: ORIGIN, reload })
  const storage = new Map<string, string>()
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value) },
  })
  const fromFrame = (frame: FakeFrame, data: unknown, ports: MessagePort[] = []) => {
    for (const listener of listeners) {
      listener({ origin: ORIGIN, source: frame.contentWindow, data, ports } as unknown as MessageEvent)
    }
  }
  // the engine the host starts answers with its API port and its control port
  const ready = (frame: FakeFrame) => {
    const api = channel()
    fromFrame(frame, { type: ENGINE_READY }, [api.port2, channel().port2])
    return api.port2
  }
  return { frames, reload, fromFrame, ready }
}

const settled = <T>(promise: Promise<T>) => Promise.race([
  promise.then((value) => ({ value }), (error: unknown) => ({ error })),
  new Promise<{ pending: true }>((resolve) => setTimeout(() => resolve({ pending: true }), 50)),
])

const sent = (frame: FakeFrame, type: string) => frame.posted.filter(({ message }) => message.type === type)

describe('an engine started again in the app realm', () => {
  let realm: ReturnType<typeof installAppRealm>

  beforeEach(() => {
    vi.resetModules()
    realm = installAppRealm()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    for (const port of open.splice(0)) port.close()
  })

  const connect = async () => {
    const client = await import('../../../src/scramjet/client')
    const first = client.startEngine()
    realm.fromFrame(realm.frames[0]!, { type: HOST_HELLO, build: BUILD })
    await settled(first)
    const api = realm.ready(realm.frames[0]!)
    expect(await settled(first)).toHaveProperty('value')
    return { ...client, api }
  }

  // a host loaded after a deploy is the new build's, and says so
  const helloFromNewHosts = () => {
    for (const frame of realm.frames.slice(1)) realm.fromFrame(frame, { type: HOST_HELLO, build: 'a-later-build' })
  }

  it('starts after a reset in the host that served the last engine, so a deploy since does not reload the page', async () => {
    const { startEngine, resetEngine } = await connect()
    resetEngine()
    const next = startEngine()
    helloFromNewHosts()
    await settled(next)
    expect(realm.frames).toHaveLength(1)
    expect(realm.frames[0]!.removed).toBe(false)
    const [restart] = sent(realm.frames[0]!, HOST_RESTART)
    expect(restart?.message).toEqual({ type: HOST_RESTART, direct: true })
    // the new engine's agent bridge and direct lane; the host keeps the bootstrap's egress and extension ports
    expect(restart?.transfer).toHaveLength(2)
    expect(sent(realm.frames[0]!, HOST_BOOTSTRAP)).toHaveLength(1)
    realm.ready(realm.frames[0]!)
    expect(await settled(next)).toHaveProperty('value')
    expect(realm.reload).not.toHaveBeenCalled()
  })

  it('starts in the same host after the engine API failed', async () => {
    const { startEngine, api } = await connect()
    api.dispatchEvent(new MessageEvent('messageerror'))
    const next = startEngine()
    helloFromNewHosts()
    await settled(next)
    expect(realm.frames).toHaveLength(1)
    expect(sent(realm.frames[0]!, HOST_RESTART)).toHaveLength(1)
    realm.ready(realm.frames[0]!)
    expect(await settled(next)).toHaveProperty('value')
    expect(realm.reload).not.toHaveBeenCalled()
  })

  it('loads a new host when the one it has never started an engine', async () => {
    const { startEngine } = await import('../../../src/scramjet/client')
    const first = startEngine()
    realm.fromFrame(realm.frames[0]!, { type: HOST_HELLO, build: BUILD })
    realm.fromFrame(realm.frames[0]!, { type: ENGINE_READY, error: 'yt-client: the controller did not start' })
    expect(await settled(first)).toHaveProperty('error')
    void startEngine().catch(() => {})
    expect(realm.frames).toHaveLength(2)
    expect(realm.frames[0]!.removed).toBe(true)
    expect(sent(realm.frames[0]!, HOST_RESTART)).toEqual([])
  })

  it('loads a new host when the restart in the kept one failed', async () => {
    const { startEngine, resetEngine } = await connect()
    resetEngine()
    const next = startEngine()
    await settled(next)
    realm.fromFrame(realm.frames[0]!, { type: ENGINE_READY, error: 'yt-client: frame connector is missing' })
    expect(await settled(next)).toHaveProperty('error')
    void startEngine().catch(() => {})
    expect(realm.frames).toHaveLength(2)
    expect(realm.frames[0]!.removed).toBe(true)
  })
})

describe('the engine host asked for another engine', () => {
  const installHost = () => {
    const toApp: { type?: string, error?: string }[] = []
    const listeners = new Set<(event: MessageEvent) => void>()
    const parent = { postMessage: (message: (typeof toApp)[number]) => { toApp.push(message) } }
    vi.stubGlobal('window', {
      parent,
      addEventListener: (type: string, listener: (event: MessageEvent) => void) => { if (type === 'message') listeners.add(listener) },
      removeEventListener: (_type: string, listener: (event: MessageEvent) => void) => { listeners.delete(listener) },
    })
    vi.stubGlobal('location', { origin: ORIGIN })
    vi.stubGlobal('document', {
      documentElement: { dataset: {} },
      createElement: () => ({ setAttribute: () => {}, style: {} }),
      body: { appendChild: () => {} },
      querySelector,
    })
    vi.stubGlobal('navigator', { serviceWorker: { register: async () => ({ active: {} }) } })
    vi.stubGlobal('fetch', async () => new Response('the frame bundle'))
    const fromApp = (data: unknown, ports: MessagePort[]) => {
      for (const listener of listeners) {
        listener({ origin: ORIGIN, source: parent, data, ports } as unknown as MessageEvent)
      }
    }
    return { toApp, fromApp }
  }

  // a new document in the frame: Scramjet runs the init hook for it, which runs the frame code and connects it
  const runFrame = () => {
    const connectors = {
      [FRAME_EGRESS_CONNECT]: vi.fn(),
      [FRAME_AGENT_CONNECT]: vi.fn(),
      [FRAME_DIRECT_CONNECT]: vi.fn(),
      [FRAME_CONNECT]: vi.fn(),
    }
    scramjet.initHook!({ isTopLevel: true, client: { natives: { call: () => () => {} } }, window: { ...connectors } })
    return connectors
  }

  beforeEach(() => {
    vi.resetModules()
    scramjet.initHook = undefined
    scramjet.visits = []
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    for (const port of open.splice(0)) port.close()
  })

  it('starts it in its frame from the code it holds, with the ports the restart brings', async () => {
    const host = installHost()
    await import('../../../src/scramjet/host')
    const [egress, extFetch, agent, direct] = Array.from({ length: 4 }, () => channel().port2)
    host.fromApp({ type: HOST_BOOTSTRAP, build: BUILD, direct: true }, [egress!, extFetch!, agent!, direct!])
    await vi.waitFor(() => expect(scramjet.visits).toHaveLength(1))
    const first = runFrame()
    expect(first[FRAME_AGENT_CONNECT].mock.calls[0]![0]).toBe(agent)
    expect(first[FRAME_DIRECT_CONNECT].mock.calls[0]![0]).toBe(direct)
    expect(host.toApp.filter(({ type }) => type === ENGINE_READY)).toHaveLength(1)

    const [nextAgent, nextDirect] = [channel().port2, channel().port2]
    const closed = [vi.spyOn(agent!, 'close'), vi.spyOn(direct!, 'close')]
    host.fromApp({ type: HOST_RESTART, direct: true }, [nextAgent, nextDirect])
    expect(scramjet.visits).toEqual(['https://www.youtube.com/__yt_client__/frame', 'https://www.youtube.com/__yt_client__/frame'])
    for (const close of closed) expect(close).toHaveBeenCalled()
    const next = runFrame()
    // compared by identity: a MessagePort has no structure a deep equality can walk
    expect(next[FRAME_AGENT_CONNECT].mock.calls[0]![0]).toBe(nextAgent)
    expect(next[FRAME_DIRECT_CONNECT].mock.calls[0]![0]).toBe(nextDirect)
    expect(next[FRAME_CONNECT]).toHaveBeenCalledTimes(1)
    expect(host.toApp.filter(({ type }) => type === ENGINE_READY)).toEqual([{ type: ENGINE_READY }, { type: ENGINE_READY }])
  })
})
