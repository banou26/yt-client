import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { BUILD_ID } from '../../../src/scramjet/engine-build'
import { ENGINE_READY, HOST_BOOTSTRAP, HOST_HELLO } from '../../../src/scramjet/protocol'
import { FRAME_AGENT_CONNECT, FRAME_CONNECT, FRAME_EGRESS_CONNECT } from '../../../src/frame/protocol'

const agentHost = vi.hoisted(() => ({
  startAgentHost: vi.fn(),
  openAgentBridge: vi.fn<() => MessagePort>(),
}))
vi.mock('../../../src/engine/agent-host', () => agentHost)

vi.mock('../../../src/scramjet/platform', () => ({
  startPlatform: async () => ({
    openEgressPort: () => new MessageChannel().port2,
    openExtFetchPort: () => new MessageChannel().port2,
  }),
  abortPlatformEgress: () => {},
}))

// enough of Scramjet for the host to reach its frame's init hook, which is where the ports are handed on
const scramjet = vi.hoisted(() => ({ initHook: undefined as undefined | ((context: unknown) => void) }))
vi.mock('@mercuryworkshop/scramjet', () => ({
  defaultConfigDev: {},
  Tap: { tap: (_hook: unknown, callback: (context: unknown) => void) => { scramjet.initHook = callback } },
}))
vi.mock('@mercuryworkshop/scramjet-controller', () => ({
  Controller: class {
    cookieJar = {}
    frames = []
    config = { codec: { decode: (value: string) => value } }
    async wait() {}
    createFrame() {
      return { id: 1, prefix: '/__yt_scramjet__/proxy/', hooks: { init: { post: {} } }, go: () => {} }
    }
  },
}))
vi.mock('../../../src/scramjet/fkn-transport', () => ({
  FRAME_BOOTSTRAP_URL: 'https://www.youtube.com/__yt_client__/frame',
  createFknTransport: () => ({ init: async () => {} }),
  createWebvpnTransport: () => ({ init: async () => {} }),
}))

const ORIGIN = 'https://youtube.fkn.app'

const stubStorage = (values: Record<string, string>) => vi.stubGlobal('localStorage', {
  getItem: (key: string) => values[key] ?? null,
})

type Posted = { message: { type?: string }, transfer: unknown[] }

// the app realm: one iframe per engine attempt, and the window's message listeners
const installAppRealm = () => {
  const frames: { posted: Posted[], contentWindow: object }[] = []
  const listeners = new Set<(event: MessageEvent) => void>()
  vi.stubGlobal('document', {
    createElement: () => {
      const posted: Posted[] = []
      const frame = {
        posted,
        contentWindow: { postMessage: (message: Posted['message'], _origin: string, transfer: unknown[] = []) => posted.push({ message, transfer }) },
        remove: () => {},
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
  vi.stubGlobal('location', { origin: ORIGIN, reload: () => {} })
  const hello = async (frame: (typeof frames)[number]) => {
    for (const listener of listeners) {
      listener({ origin: ORIGIN, source: frame.contentWindow, data: { type: HOST_HELLO, build: BUILD_ID }, ports: [] } as unknown as MessageEvent)
    }
    await vi.waitFor(() => expect(frame.posted.length).toBeGreaterThan(0))
    return frame.posted.find(({ message }) => message.type === HOST_BOOTSTRAP)!
  }
  return { frames, hello }
}

describe('the app realm with yt-client:step:y1 off', () => {
  beforeEach(() => {
    vi.resetModules()
    agentHost.startAgentHost.mockReset()
    agentHost.openAgentBridge.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each([
    ['unset', {}],
    ['set to anything but 1', { 'yt-client:step:y1': 'true' }],
  ])('hands the engine its two ports and attaches nothing, with the flag %s', async (_, storage) => {
    stubStorage(storage)
    const realm = installAppRealm()
    const { startEngine } = await import('../../../src/scramjet/client')
    void startEngine().catch(() => {})
    const bootstrap = await realm.hello(realm.frames[0]!)
    expect(bootstrap.transfer).toHaveLength(2)
    expect(agentHost.startAgentHost).not.toHaveBeenCalled()
    expect(agentHost.openAgentBridge).not.toHaveBeenCalled()
  })

  // the control: the same check reads the flag on, so it can tell the two apart
  it('with the flag on, attaches the engine page at boot and hands the bridge as a third port', async () => {
    stubStorage({ 'yt-client:step:y1': '1' })
    const bridge = new MessageChannel()
    agentHost.openAgentBridge.mockReturnValue(bridge.port2)
    const realm = installAppRealm()
    const { startEngine } = await import('../../../src/scramjet/client')
    void startEngine().catch(() => {})
    expect(agentHost.startAgentHost).toHaveBeenCalledTimes(1)
    const bootstrap = await realm.hello(realm.frames[0]!)
    expect(bootstrap.transfer).toHaveLength(3)
    expect(bootstrap.transfer[2]).toBe(bridge.port2)
    bridge.port1.close()
  })
})

describe('the engine host with and without the agent port', () => {
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
    })
    vi.stubGlobal('navigator', { serviceWorker: { register: async () => ({ active: {} }) } })
    vi.stubGlobal('fetch', async () => new Response('the frame bundle'))
    const fromApp = (ports: MessagePort[]) => {
      for (const listener of listeners) {
        listener({ origin: ORIGIN, source: parent, data: { type: HOST_BOOTSTRAP, build: BUILD_ID }, ports } as unknown as MessageEvent)
      }
    }
    return { toApp, fromApp }
  }

  const runFrame = async ({ agentConnector = true } = {}) => {
    await vi.waitFor(() => expect(scramjet.initHook).toBeDefined())
    const frameWindow: Record<string, unknown> = {
      [FRAME_EGRESS_CONNECT]: vi.fn(),
      [FRAME_CONNECT]: vi.fn(),
      ...(agentConnector && { [FRAME_AGENT_CONNECT]: vi.fn() }),
    }
    const connectors = { ...frameWindow } as Record<string, ReturnType<typeof vi.fn>>
    scramjet.initHook!({ isTopLevel: true, client: { natives: { call: () => () => {} } }, window: frameWindow })
    return { frameWindow, connectors }
  }

  const open: MessagePort[] = []
  const ports = (count: number) => Array.from({ length: count }, () => {
    const channel = new MessageChannel()
    open.push(channel.port1, channel.port2)
    return channel.port2
  })

  beforeEach(() => {
    vi.resetModules()
    scramjet.initHook = undefined
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    for (const port of open.splice(0)) port.close()
  })

  it('with two ports, the frame gets no agent and its connector is removed', async () => {
    const host = installHost()
    await import('../../../src/scramjet/host')
    host.fromApp(ports(2))
    const { frameWindow, connectors } = await runFrame()
    expect(connectors[FRAME_AGENT_CONNECT]).not.toHaveBeenCalled()
    expect(frameWindow).not.toHaveProperty(FRAME_AGENT_CONNECT)
    expect(host.toApp.find(({ type }) => type === ENGINE_READY)).toEqual({ type: ENGINE_READY })
  })

  it('with three ports, the third goes to the frame as its agent port', async () => {
    const host = installHost()
    await import('../../../src/scramjet/host')
    const given = ports(3)
    host.fromApp(given)
    const { frameWindow, connectors } = await runFrame()
    // compared by identity: a MessagePort has no structure a deep equality can walk
    expect(connectors[FRAME_AGENT_CONNECT]!.mock.calls).toHaveLength(1)
    expect(connectors[FRAME_AGENT_CONNECT]!.mock.calls[0]![0]).toBe(given[2])
    expect(frameWindow).not.toHaveProperty(FRAME_AGENT_CONNECT)
  })

  it('with three ports and a frame that has no agent connector, the port is closed and the frame still connects', async () => {
    const host = installHost()
    await import('../../../src/scramjet/host')
    const given = ports(3)
    const close = vi.spyOn(given[2]!, 'close')
    host.fromApp(given)
    const { connectors } = await runFrame({ agentConnector: false })
    expect(close).toHaveBeenCalled()
    expect(connectors[FRAME_CONNECT]).toHaveBeenCalledTimes(1)
    expect(host.toApp.find(({ type }) => type === ENGINE_READY)).toEqual({ type: ENGINE_READY })
  })
})
