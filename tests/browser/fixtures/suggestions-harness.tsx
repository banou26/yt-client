import type { SourceApi } from '../../../src/sources/types'

import { createSchema, createYoga } from 'graphql-yoga'
import { render } from 'preact'
import { Client, fetchExchange, Provider } from 'urql'

import { Header } from '../../../src/components/header'
import { createCache } from '../../../src/graphql'
import { createYoutubeSource } from '../../../src/sources/youtube'
import { resolvers } from '../../../src/worker/resolvers'
import typeDefs from '../../../src/worker/schema.gql?raw'

// served by the dev server and imported from a spec: the header over the app's own source, schema, resolvers and
// cache, the source fetching from this page so the spec can answer for upstream. The transformed host holds the fixed
// header 100 px down.
export const mountSuggestions = () => {
  const host = document.createElement('div')
  host.setAttribute('data-suggestions-harness', '')
  host.style.cssText = 'position: fixed; left: 0; right: 0; top: 100px; height: 5.6rem; z-index: 10000; transform: translateZ(0)'
  document.body.append(host)
  const source = createYoutubeSource({
    fetch: globalThis.fetch.bind(globalThis),
    createClient: async () => ({ session: { logged_in: false, context: { client: { hl: 'en', gl: 'US' } } } }) as never,
  }) as unknown as SourceApi
  const yoga = createYoga<{ source: SourceApi }>({
    graphqlEndpoint: '/graphql',
    maskedErrors: false,
    schema: createSchema({ typeDefs, resolvers }),
  })
  const client = new Client({
    url: 'http://suggestions-harness.local/graphql',
    exchanges: [createCache(), fetchExchange],
    fetch: async (input, init) => yoga.handleRequest(new Request(input, init), { source }),
  })
  render(<Provider value={client}><Header /></Provider>, host)
}
