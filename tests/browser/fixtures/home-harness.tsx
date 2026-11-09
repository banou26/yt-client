import { render } from 'preact'
import { Client, fetchExchange, Provider } from 'urql'

import HomePage from '../../../src/routes/home'

const feed = (filters: boolean) => ({
  home: {
    items: filters ? [{ id: 'video-0', title: 'Video 0', channel: { id: 'channel-0', name: 'Channel 0' } }] : [],
    shorts: [],
    chips: filters
      ? [{ id: 'chip-all', label: 'All', selected: true }, { id: 'chip-music', label: 'Music', selected: false }]
      : [],
    cursor: null,
  },
})

// served by the dev server and imported from a spec, to render Home over a feed with filters (as signed in) or an empty one (as signed out)
export const mountHome = (filters: boolean) => {
  const host = document.createElement('div')
  host.setAttribute('data-home-harness', filters ? 'filters' : 'empty')
  document.body.append(host)
  const fetchAnswer = async () =>
    new Response(JSON.stringify({ data: feed(filters) }), { headers: { 'content-type': 'application/json' } })
  const client = new Client({ url: '/home-harness', exchanges: [fetchExchange], fetch: fetchAnswer, preferGetMethod: false })
  render(<Provider value={client}><HomePage /></Provider>, host)
}
