import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { HOST_BOOTSTRAP, HOST_HELLO } from '../../../src/scramjet/protocol'
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

const lane = vi.hoisted(() => ({ port: undefined as MessagePort | undefined }))

vi.mock('../../../src/scramjet/direct-lane', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../src/scramjet/direct-lane')>(),
  openDirectLane: () => {
    const channel = new MessageChannel()
    lane.port = channel.port2
    return { port: channel.port2, close: () => channel.port1.close() }
  },
}))

const ORIGIN = 'https://youtube.fkn.app'

type Posted = { message: { type?: string, direct?: boolean }, transfer: unknown[] }

// just enough of a window for client.ts to post its bootstrap to one host frame
const installWindow = (flags: Record<string, string>) => {
  const posted: Posted[] = []
  const listeners = new Set<(event: MessageEvent) => void>()
  const dataset: Record<string, string> = {}
  const contentWindow = { postMessage: (message: Posted['message'], _origin: string, transfer: unknown[] = []) => posted.push({ message, transfer }) }
  vi.stubGlobal('document', {
    createElement: () => ({ contentWindow, remove: () => {} }),
    body: { appendChild: () => {} },
    documentElement: { dataset },
    querySelector,
  })
  vi.stubGlobal('window', {
    addEventListener: (_type: string, listener: (event: MessageEvent) => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: (event: MessageEvent) => void) => listeners.delete(listener),
  })
  vi.stubGlobal('location', { origin: ORIGIN })
  vi.stubGlobal('localStorage', { getItem: (key: string) => flags[key] ?? null })
  const hello = () => {
    for (const listener of listeners) {
      listener({ origin: ORIGIN, source: contentWindow, data: { type: HOST_HELLO, build: BUILD }, ports: [] } as unknown as MessageEvent)
    }
  }
  return { posted, dataset, hello }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20))

describe('the engine bootstrap and the direct lane', () => {
  beforeEach(() => {
    vi.resetModules()
    lane.port = undefined
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('hands the host no direct lane and marks it off when the step is turned off', async () => {
    const window = installWindow({ 'yt-client:step:direct': '0' })
    const { startEngine, resetEngine } = await import('../../../src/scramjet/client')
    void startEngine().catch(() => {})
    window.hello()
    await settle()
    const [bootstrap] = window.posted.filter(({ message }) => message.type === HOST_BOOTSTRAP)
    expect(bootstrap?.message).toEqual({ type: HOST_BOOTSTRAP, build: BUILD })
    expect(bootstrap?.transfer).toHaveLength(3)
    expect(lane.port).toBeUndefined()
    expect(window.dataset.ytDirect).toBe('off')
    resetEngine()
  })

  it('hands the host the direct lane as its last port by default', async () => {
    const window = installWindow({})
    const { startEngine, resetEngine } = await import('../../../src/scramjet/client')
    void startEngine().catch(() => {})
    window.hello()
    await settle()
    const [bootstrap] = window.posted.filter(({ message }) => message.type === HOST_BOOTSTRAP)
    expect(bootstrap?.message).toEqual({ type: HOST_BOOTSTRAP, build: BUILD, direct: true })
    expect(bootstrap?.transfer).toHaveLength(4)
    expect(lane.port).toBeInstanceOf(MessagePort)
    expect(bootstrap?.transfer.at(-1)).toBe(lane.port)
    expect(window.dataset.ytDirect).toBeUndefined()
    resetEngine()
  })
})
