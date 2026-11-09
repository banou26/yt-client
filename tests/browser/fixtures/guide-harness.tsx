import { render } from 'preact'
import { Client, fetchExchange, Provider } from 'urql'

import { Guide } from '../../../src/components/guide'

const answer = (operationName: string, signedIn: boolean) => {
  if (operationName === 'Session') return { session: { signedIn, name: signedIn ? 'Viewer' : null, avatar: null, handle: null, accounts: [] } }
  if (operationName === 'GuideSubscriptions') return { subscribedChannels: [] }
  return null
}

// served by the dev server and imported from a spec, to render the expanded guide for a fixed session
export const mountGuide = (signedIn: boolean) => {
  const host = document.createElement('div')
  host.setAttribute('data-guide-harness', signedIn ? 'signed-in' : 'signed-out')
  document.body.append(host)
  const fetchAnswer = async (_url: RequestInfo | URL, init?: RequestInit) => {
    const { operationName } = JSON.parse(init?.body as string) as { operationName: string }
    return new Response(JSON.stringify({ data: answer(operationName, signedIn) }), { headers: { 'content-type': 'application/json' } })
  }
  const client = new Client({ url: '/guide-harness', exchanges: [fetchExchange], fetch: fetchAnswer, preferGetMethod: false })
  render(<Provider value={client}><Guide variant='expanded' /></Provider>, host)
}
