import { render } from 'preact'
import { Client, fetchExchange, Provider } from 'urql'

import { Guide } from '../../../src/components/guide'

type HarnessSession = 'signed-in' | 'signed-out' | 'pending'

const answer = (operationName: string, signedIn: boolean) => {
  if (operationName === 'Session') return { session: { signedIn, name: signedIn ? 'Viewer' : null, avatar: null, handle: null, accounts: [] } }
  if (operationName === 'GuideSubscriptions') return { subscribedChannels: [] }
  return null
}

const mount = (session: HarnessSession) => {
  const host = document.createElement('div')
  host.setAttribute('data-guide-harness', session)
  document.body.append(host)
  const fetchAnswer = async (_url: RequestInfo | URL, init?: RequestInit) => {
    const { operationName } = JSON.parse(init?.body as string) as { operationName: string }
    if (session === 'pending' && operationName === 'Session') return new Promise<Response>(() => {})
    return new Response(JSON.stringify({ data: answer(operationName, session === 'signed-in') }), { headers: { 'content-type': 'application/json' } })
  }
  const client = new Client({ url: '/guide-harness', exchanges: [fetchExchange], fetch: fetchAnswer, preferGetMethod: false })
  render(<Provider value={client}><Guide variant='expanded' /></Provider>, host)
}

// served by the dev server and imported from a spec, to render the expanded guide for a fixed session
export const mountGuide = (signedIn: boolean) => mount(signedIn ? 'signed-in' : 'signed-out')

// the Session answer never comes, as on a cold load before the session probe returns
export const mountPendingGuide = () => mount('pending')
