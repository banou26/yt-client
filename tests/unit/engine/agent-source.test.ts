import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import { AGENT_GLOBAL, AGENT_INSTALL } from '../../../src/engine/agent-protocol'
import { agentSource } from '../../../src/engine/agent-source'
import { installAgent } from '../../../src/engine/botguard-agent'
import { agentClient, APP_ORIGIN, fakeAgentPage, turn } from './agent-fakes'

describe("the agent on BotGuard's page", () => {
  const open: MessagePort[] = []

  afterEach(() => {
    vi.unstubAllGlobals()
    delete (globalThis as Record<string, unknown>)[AGENT_GLOBAL]
    for (const port of open.splice(0)) port.close()
  })

  it('the built script adds no name to the global or the window, and still takes its port', async () => {
    const listeners: ((event: MessageEvent) => void)[] = []
    const page = { addEventListener: (_type: string, listener: (event: MessageEvent) => void) => { listeners.push(listener) } }
    vi.stubGlobal('window', page)
    const before = { global: Object.keys(globalThis), page: Object.keys(page) }

    // indirect eval runs it as global code, where a top-level var becomes a property of the global, as in a classic script
    // oxlint-disable-next-line no-eval
    ;(0, eval)(agentSource(APP_ORIGIN))
    expect(Object.keys(globalThis)).toEqual(before.global)
    expect(AGENT_GLOBAL in globalThis).toBe(false)
    expect(Object.keys(page)).toEqual(before.page)

    // the control: the script did install the agent, which takes a port from the app's origin
    const channel = new MessageChannel()
    open.push(channel.port1, channel.port2)
    const client = agentClient(channel.port1)
    for (const listener of listeners) listener({ origin: APP_ORIGIN, data: { type: AGENT_INSTALL }, ports: [channel.port2] } as unknown as MessageEvent)
    await turn()
    expect(client.controls).toEqual([{ type: 'ready' }])
  })

  it('the install mark is no enumerable name on the page, and a second install still sees it', () => {
    const page = fakeAgentPage()
    const before = Object.keys(page.scope)
    expect(installAgent({ scope: page.scope, appOrigin: APP_ORIGIN, runScript: page.runScript })).toBe('installed')
    expect(Object.keys(page.scope)).toEqual(before)
    expect(installAgent({ scope: page.scope, appOrigin: APP_ORIGIN, runScript: page.runScript })).toBe('already')
  })
})
