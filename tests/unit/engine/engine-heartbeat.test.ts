import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import type { AgentFrame } from '../../../src/engine/agent-host'

import { AGENT_PAGE_ORIGIN } from '../../../src/engine/agent-protocol'
import { AGENT_REPLACED, AGENT_UNAVAILABLE, createAgentHost } from '../../../src/engine/agent-host'
import { installAgent } from '../../../src/engine/botguard-agent'
import { agentClient, APP_ORIGIN, CHALLENGE, fakeAgentPage, INTEGRITY, mintedBy, turn } from './agent-fakes'

const AGENT_SOURCE = 'the agent bundle'

type EnginePage = {
  frame: AgentFrame
  detached: boolean
  scriptTags: string[]
  targetOrigins: string[]
  freeze(): void
  thaw(): void
  newDocument(): void
}

// an attachment as the app realm sees it, whose page runs the real agent; each document is a fresh realm with its own BotGuard
const enginePage = (label: string): EnginePage => {
  let realm = fakeAgentPage(label)
  let documents = 1
  let frozen = false
  const documentListeners = new Set<() => void>()
  const page: EnginePage = {
    detached: false,
    scriptTags: [],
    targetOrigins: [],
    frame: {
      addScriptTag: async ({ content }) => {
        page.scriptTags.push(content)
        installAgent({ scope: realm.scope, appOrigin: APP_ORIGIN, runScript: realm.runScript })
      },
      postMessage: async (message, { targetOrigin, transfer }) => {
        page.targetOrigins.push(targetOrigin)
        // a relay in front of the page, so the test can stop it answering without closing anything
        const appEnd = transfer[0] as MessagePort
        const inner = new MessageChannel()
        appEnd.addEventListener('message', (event) => { if (!frozen) inner.port1.postMessage(event.data) })
        inner.port1.addEventListener('message', (event) => { if (!frozen) appEnd.postMessage(event.data) })
        appEnd.start()
        inner.port1.start()
        realm.deliver({ origin: APP_ORIGIN, data: message, ports: [inner.port2] })
      },
      on: (_type, listener) => { documentListeners.add(listener) },
    },
    freeze: () => { frozen = true },
    thaw: () => { frozen = false },
    newDocument: () => {
      realm = fakeAgentPage(`${label}-document-${++documents}`)
      for (const listener of documentListeners) listener()
    },
  }
  return page
}

const startHost = (attachOutcome?: () => Promise<never>) => {
  const pages: EnginePage[] = []
  const published: [string, string][] = []
  const host = createAgentHost({
    attach: async () => {
      if (attachOutcome) return attachOutcome()
      const page = enginePage(`page-${pages.length + 1}`)
      pages.push(page)
      return { frame: page.frame, detach: () => { page.detached = true } }
    },
    source: async () => AGENT_SOURCE,
    publish: (name, value) => { published.push([name, value]) },
  })
  return { host, pages, published }
}

const mintThrough = async (bridge: ReturnType<typeof agentClient>, identifier: string) => {
  const session = await bridge.call('create', CHALLENGE)
  await bridge.call('snapshot', session)
  await bridge.call('minter', session, INTEGRITY)
  return { session, token: await bridge.call('mint', session, identifier) }
}

const beat = async (times = 1) => {
  for (let index = 0; index < times; index++) {
    vi.advanceTimersByTime(5_000)
    await turn()
  }
}

describe('the engine page heartbeat', () => {
  let opened: MessagePort[] = []
  const bridgeOf = (host: ReturnType<typeof createAgentHost>) => {
    const port = host.openBridge()
    opened.push(port)
    return agentClient(port)
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
  })

  afterEach(() => {
    vi.useRealTimers()
    for (const port of opened.splice(0)) port.close()
    opened = []
  })

  it('a missed heartbeat attaches again; a second engine generation gets working mints on a new port', async () => {
    const { host, pages } = startHost()
    const bridge = bridgeOf(host)

    const first = await mintThrough(bridge, 'video-1')
    expect(first.token).toBe(mintedBy('page-1', 'video-1'))
    expect(pages[0]!.scriptTags).toEqual([AGENT_SOURCE])
    expect(pages[0]!.targetOrigins).toEqual([AGENT_PAGE_ORIGIN])

    // a page that answers its pings is kept, however long it lives
    await beat(5)
    expect(pages).toHaveLength(1)

    pages[0]!.freeze()
    const stuck = expect(bridge.call('mint', first.session, 'video-x')).rejects.toThrow(AGENT_REPLACED)
    await beat(3)
    expect(pages).toHaveLength(1)
    await beat(1)
    // 15000 ms since the first ping nothing answered: the attachment goes and a fresh one is made
    expect(pages).toHaveLength(2)
    expect(pages[0]!.detached).toBe(true)
    await stuck

    const again = await mintThrough(bridge, 'video-2')
    expect(again.token).toBe(mintedBy('page-2', 'video-2'))

    // an engine reset: a new bridge, and the agent on the same page takes a new port
    const second = bridgeOf(host)
    const next = await mintThrough(second, 'video-3')
    expect(next.token).toBe(mintedBy('page-2', 'video-3'))
    expect(pages).toHaveLength(2)
    expect(pages[1]!.scriptTags).toEqual([AGENT_SOURCE, AGENT_SOURCE])
    // the earlier generation's sessions went with its port
    await expect(second.call('snapshot', again.session)).rejects.toThrow(/no session/)
  })

  it('a hidden tab whose heartbeat runs once a minute keeps a healthy page, and still replaces a stuck one', async () => {
    const { host, pages } = startHost()
    const bridge = bridgeOf(host)
    await mintThrough(bridge, 'video-1')
    await beat(2)
    expect(pages).toHaveLength(1)

    // Chrome's intensive throttling of a hidden tab wakes the 5000 ms interval about once a minute
    const throttledBeat = async () => {
      vi.setSystemTime(Date.now() + 55_000)
      await beat(1)
    }
    await throttledBeat()
    await throttledBeat()
    expect(pages).toHaveLength(1)

    pages[0]!.freeze()
    await throttledBeat()
    expect(pages).toHaveLength(1)
    await throttledBeat()
    expect(pages).toHaveLength(2)
  })

  it("a new bridge drops the previous generation's calls, queued or in flight, so none is answered on it", async () => {
    let release!: () => void
    const released = new Promise<void>((resolve) => { release = resolve })
    const page = enginePage('page-1')
    const host = createAgentHost({
      attach: async () => {
        await released
        return { frame: page.frame, detach: () => {} }
      },
      source: async () => AGENT_SOURCE,
      publish: () => {},
    })
    // a frame's ids start over with each engine generation, so an old answer would land on the new frame's own call
    const listen = () => {
      const port = host.openBridge()
      opened.push(port)
      const heard: unknown[] = []
      port.addEventListener('message', (event) => heard.push(event.data))
      return { client: agentClient(port), heard }
    }

    const first = listen()
    void first.client.call('create', CHALLENGE).catch(() => {})
    await turn()
    const second = listen()
    release()
    await turn()
    expect(second.heard).toEqual([])

    page.freeze()
    void second.client.call('create', CHALLENGE).catch(() => {})
    await turn()
    const third = listen()
    page.thaw()
    await turn()
    expect(third.heard).toEqual([])

    // the control: the new frame's own calls are answered on its bridge
    expect((await mintThrough(third.client, 'video-1')).token).toBe(mintedBy('page-1', 'video-1'))
  })

  it('a new document in the frame gets the agent again, without a new attachment', async () => {
    const { host, pages } = startHost()
    const bridge = bridgeOf(host)
    await mintThrough(bridge, 'video-1')

    pages[0]!.newDocument()
    const minted = await mintThrough(bridge, 'video-2')
    expect(minted.token).toBe(mintedBy('page-1-document-2', 'video-2'))
    expect(pages).toHaveLength(1)
    expect(pages[0]!.scriptTags).toHaveLength(2)
  })

  it('a refused attach answers every call as unavailable, at once', async () => {
    const { host } = startHost(async () => { throw new Error('cloud.attachFrame: this FKN page predates blank pages; reload the app to load the current one') })
    const bridge = bridgeOf(host)
    await expect(bridge.call('create', CHALLENGE)).rejects.toThrow(AGENT_UNAVAILABLE)
    await beat(4)
    await expect(bridge.call('create', CHALLENGE)).rejects.toThrow(AGENT_UNAVAILABLE)
  })

  it('an install whose message is refused answers unavailable, and its wait for the agent ends handled', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
    const host = createAgentHost({
      attach: async () => ({
        frame: {
          addScriptTag: async () => {},
          postMessage: async () => { throw new Error('cloud.attachFrame: the attached iframe left the document or was reloaded; attach a fresh iframe') },
          on: () => {},
        },
        detach: () => {},
      }),
      source: async () => AGENT_SOURCE,
      publish: () => {},
    })
    const bridge = bridgeOf(host)
    const immediate = () => new Promise((resolve) => { setImmediate(resolve) })
    const refused = expect(bridge.call('create', CHALLENGE)).rejects.toThrow(AGENT_UNAVAILABLE)
    for (let tries = 0; tries < 20; tries++) await immediate()
    await refused
    // past the install's own deadline, where a wait left unhandled would surface as an unhandled rejection
    await vi.advanceTimersByTimeAsync(10_000)
  })

  it("publishes the frame's mint and engine reports on <html>, and nothing else", async () => {
    const { host, published } = startHost()
    const bridge = bridgeOf(host)
    bridge.post({ type: 'report', engine: 'agent' })
    bridge.post({ type: 'report', mint: 'session' })
    bridge.post({ type: 'report', mint: 'cold', engine: 'scramjet' })
    bridge.post({ type: 'report', mint: '<b>', engine: 'other' })
    await turn()
    expect(published).toEqual([['ytEngine', 'agent'], ['ytMint', 'session'], ['ytEngine', 'scramjet'], ['ytMint', 'cold']])
  })
})
