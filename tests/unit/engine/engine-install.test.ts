import { afterEach, describe, expect, it } from 'vite-plus/test'

import { AGENT_INSTALL, AGENT_PAGE_ORIGIN } from '../../../src/engine/agent-protocol'
import { installAgent } from '../../../src/engine/botguard-agent'
import { agentClient, APP_ORIGIN, fakeAgentPage, turn } from './agent-fakes'

const open: MessagePort[] = []

const channel = () => {
  const next = new MessageChannel()
  open.push(next.port1, next.port2)
  return { client: agentClient(next.port1), port: next.port2 }
}

describe('installing the agent', () => {
  afterEach(() => {
    for (const port of open.splice(0)) port.close()
  })

  it("the agent takes a port only from the app's origin, with the right type and one port", async () => {
    const page = fakeAgentPage()
    installAgent({ scope: page.scope, appOrigin: APP_ORIGIN, runScript: page.runScript })

    const refused = [
      // the page's own origin, which is what a message the page posted to itself carries
      { origin: AGENT_PAGE_ORIGIN, data: { type: AGENT_INSTALL } },
      { origin: 'https://other.example', data: { type: AGENT_INSTALL } },
      { origin: APP_ORIGIN, data: { type: 'yt-client:something-else' } },
      { origin: APP_ORIGIN, data: AGENT_INSTALL },
      { origin: APP_ORIGIN, data: null },
    ].map((event) => {
      const { client, port } = channel()
      page.deliver({ ...event, ports: [port] })
      return client
    })
    const none = channel()
    page.deliver({ origin: APP_ORIGIN, data: { type: AGENT_INSTALL }, ports: [] })
    const two = channel()
    const extra = channel()
    page.deliver({ origin: APP_ORIGIN, data: { type: AGENT_INSTALL }, ports: [two.port, extra.port] })
    await turn()
    for (const client of [...refused, none.client, two.client, extra.client]) expect(client.controls).toEqual([])

    const taken = channel()
    page.deliver({ origin: APP_ORIGIN, data: { type: AGENT_INSTALL }, ports: [taken.port] })
    await turn()
    expect(taken.client.controls).toEqual([{ type: 'ready' }])
  })
})
