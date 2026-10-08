import { afterEach, describe, expect, it } from 'vite-plus/test'

import { AGENT_INSTALL } from '../../../src/engine/agent-protocol'
import { installAgent } from '../../../src/engine/botguard-agent'
import { agentClient, APP_ORIGIN, CHALLENGE, fakeAgentPage, INTEGRITY, mintedBy, PROGRAM, turn } from './agent-fakes'

const open: MessagePort[] = []

const connect = (page: ReturnType<typeof fakeAgentPage>) => {
  const channel = new MessageChannel()
  open.push(channel.port1)
  const client = agentClient(channel.port1)
  page.deliver({ origin: APP_ORIGIN, data: { type: AGENT_INSTALL }, ports: [channel.port2] })
  return client
}

const installed = () => {
  const page = fakeAgentPage()
  expect(installAgent({ scope: page.scope, appOrigin: APP_ORIGIN, runScript: page.runScript })).toBe('installed')
  return page
}

describe('the BotGuard agent', () => {
  afterEach(() => {
    for (const port of open.splice(0)) port.close()
  })

  it('create, snapshot, mint and shutdown against a fake BotGuard', async () => {
    const page = installed()
    const agent = connect(page)
    await turn()
    expect(agent.controls).toEqual([{ type: 'ready' }])

    const session = await agent.call('create', CHALLENGE)
    expect(page.scripts).toEqual([CHALLENGE.interpreter])
    expect(page.log).toEqual([`agent load ${PROGRAM}`])
    expect(await agent.call('snapshot', session)).toBe(`agent snapshot of ${PROGRAM}`)
    expect(await agent.call('minter', session, INTEGRITY)).toBeUndefined()
    expect(await agent.call('mint', session, 'video-1')).toBe(mintedBy('agent', 'video-1'))
    expect(await agent.call('mint', session, 'video-2')).toBe(mintedBy('agent', 'video-2'))

    expect(await agent.call('shutdown', session)).toBeUndefined()
    expect(page.log).toContain('agent shutdown')
    expect(page.removed()).toBe(1)
    await expect(agent.call('mint', session, 'video-1')).rejects.toThrow(/no session/)
  })

  it('an unknown method is refused', async () => {
    const agent = connect(installed())
    await expect(agent.call('evaluate', 'document.cookie')).rejects.toThrow('yt-client agent: unknown method "evaluate"')
    await expect(agent.call('constructor')).rejects.toThrow('yt-client agent: unknown method "constructor"')
  })

  it("a second install answers 'already' and adds no second listener", () => {
    const page = installed()
    expect(installAgent({ scope: page.scope, appOrigin: APP_ORIGIN, runScript: page.runScript })).toBe('already')
    expect(page.listeners.size).toBe(1)
  })

  it('answers a ping, which is the heartbeat the app realm counts', async () => {
    const agent = connect(installed())
    agent.post({ type: 'ping' })
    await turn()
    expect(agent.controls).toEqual([{ type: 'ready' }, { type: 'pong' }])
  })

  it('refuses an interpreter that defines no global, and removes its script', async () => {
    const page = installed()
    const agent = connect(page)
    await expect(agent.call('create', { ...CHALLENGE, interpreter: 'something else' })).rejects.toThrow(/did not define fakeBotguard/)
    expect(page.removed()).toBe(1)
  })

  it("a new port shuts down the previous port's sessions", async () => {
    const page = installed()
    const first = connect(page)
    const session = await first.call('create', CHALLENGE)
    await first.call('snapshot', session)

    const second = connect(page)
    await turn()
    expect(second.controls).toEqual([{ type: 'ready' }])
    expect(page.log).toContain('agent shutdown')
    await expect(second.call('snapshot', session)).rejects.toThrow(/no session/)
  })
})
