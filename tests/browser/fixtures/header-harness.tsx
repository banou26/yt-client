import { render } from 'preact'
import { Client, fetchExchange, Provider } from 'urql'

import { Header } from '../../../src/components/header'

type HarnessSession = 'signed-in' | 'pending'

const answer = (operationName: string) => {
  if (operationName === 'Session') return { session: { signedIn: true, name: 'Viewer', avatar: null, handle: null, accounts: [] } }
  if (operationName === 'UnseenNotificationCount') return { unseenNotificationCount: 0 }
  return null
}

// served by the dev server and imported from a spec: the header for a signed-in session, or for one that never
// answers, as on a cold load before the session probe returns. The transformed host holds the fixed header at `top`.
export const mountHeader = (session: HarnessSession, top: number) => {
  const host = document.createElement('div')
  host.setAttribute('data-header-harness', session)
  host.style.cssText = `position: fixed; left: 0; right: 0; top: ${top}px; height: 5.6rem; z-index: 10000; transform: translateZ(0)`
  document.body.append(host)
  const fetchAnswer = async (_url: RequestInfo | URL, init?: RequestInit) => {
    const { operationName } = JSON.parse(init?.body as string) as { operationName: string }
    if (session === 'pending' && operationName === 'Session') return new Promise<Response>(() => {})
    return new Response(JSON.stringify({ data: answer(operationName) }), { headers: { 'content-type': 'application/json' } })
  }
  const client = new Client({ url: '/header-harness', exchanges: [fetchExchange], fetch: fetchAnswer, preferGetMethod: false })
  render(<Provider value={client}><Header /></Provider>, host)
}
