import { render } from 'preact'
import { Client, fetchExchange, Provider } from 'urql'

import { LIKED_VIDEOS_ID } from '../../../src/components/playlist'
import YouPage from '../../../src/routes/feed-you'

const video = { id: 'video-0', title: 'Video 0', channel: { id: 'channel-0', name: 'Channel 0' } }

const answer = (operationName: string, variables?: { id?: string }) => {
  if (operationName === 'Session') return { session: { signedIn: true, name: 'Viewer', avatar: null, handle: null, accounts: [] } }
  if (operationName === 'YouHistory') return { history: { sections: [{ items: [video] }] } }
  if (operationName === 'YouPlaylists') return { playlists: { items: [] } }
  if (operationName === 'YouPlaylist') {
    return { playlist: { playlist: { id: variables?.id }, items: variables?.id === LIKED_VIDEOS_ID ? [{ video }] : [] } }
  }
  return null
}

const fetchAnswer = async (_url: RequestInfo | URL, init?: RequestInit) => {
  const { operationName, variables } = JSON.parse(init?.body as string) as { operationName: string, variables?: { id?: string } }
  return new Response(JSON.stringify({ data: answer(operationName, variables) }), { headers: { 'content-type': 'application/json' } })
}

// served by the dev server and imported from a spec, to render the signed-in You page against fixed answers: a liked video, nothing in Watch later
export const mountYou = () => {
  const host = document.createElement('div')
  host.setAttribute('data-you-harness', '')
  document.body.append(host)
  const client = new Client({ url: '/you-harness', exchanges: [fetchExchange], fetch: fetchAnswer, preferGetMethod: false })
  render(<Provider value={client}><YouPage /></Provider>, host)
}
