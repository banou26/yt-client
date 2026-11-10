import type { SourceApi } from '../../../src/sources/types'

import { createSchema, createYoga } from 'graphql-yoga'
import { render } from 'preact'
import { Client, fetchExchange, Provider } from 'urql'

import { createCache } from '../../../src/graphql'
import HomePage from '../../../src/routes/home'
import { resolvers } from '../../../src/worker/resolvers'
import typeDefs from '../../../src/worker/schema.gql?raw'

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

let reopen: ((event: Event) => void) | undefined

/**
 * Renders Home through the app's own schema, resolvers and cache over a source whose every Home read answers one new
 * video, `video-<n>` for the nth read, so the video on screen tells which read Home shows. `reopenHome` closes it and
 * opens it again after the event a navigation dispatches.
 */
export const mountCachedHome = () => {
  const host = document.createElement('div')
  host.setAttribute('data-cached-home-harness', '')
  document.body.append(host)
  let reads = 0
  const source = {
    home: async () => {
      reads += 1
      return { items: [{ id: `video-${reads}`, title: `Video ${reads}`, channel: { id: 'channel-0', name: 'Channel 0' } }], shorts: [], chips: [] }
    },
  } as unknown as SourceApi
  const yoga = createYoga<{ source: SourceApi }>({
    graphqlEndpoint: '/graphql',
    maskedErrors: false,
    schema: createSchema({ typeDefs, resolvers }),
  })
  const client = new Client({
    url: 'http://home-harness.local/graphql',
    exchanges: [createCache(), fetchExchange],
    fetch: async (input, init) => yoga.handleRequest(new Request(input, init), { source }),
  })
  const home = () => <Provider value={client}><HomePage /></Provider>
  render(home(), host)
  reopen = (event) => {
    render(null, host)
    dispatchEvent(event)
    render(home(), host)
  }
}

/** Opens the cached Home again as a link click does (`pushState`, which wouter's history patch dispatches) or as going back does. */
export const reopenHome = (how: 'pushState' | 'popstate') => reopen!(how === 'popstate' ? new PopStateEvent('popstate') : new Event('pushState'))
