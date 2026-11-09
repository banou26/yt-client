import type { SourceApi } from '../../../src/sources/types'

import { createSchema, createYoga } from 'graphql-yoga'
import { render } from 'preact'
import { Client, fetchExchange, Provider } from 'urql'
import { Parser, YT } from 'youtubei.js'

import { createCache } from '../../../src/graphql'
import { ChannelPage } from '../../../src/routes/channel'
import { createYoutubeSource } from '../../../src/sources/youtube'
import { resolvers } from '../../../src/worker/resolvers'
import typeDefs from '../../../src/worker/schema.gql?raw'
import home from '../../unit/fixtures/channel-home-mkbhd.json'

export const MKBHD = 'UCBJycsmduvYEL83R_U4JriQ'

// served by the dev server and imported from a spec, to render a channel's Home from a recorded answer through the
// app's own schema, resolvers and cache, where one video in two rows is one cached video
export const mountChannelHome = () => {
  const host = document.createElement('div')
  host.setAttribute('data-channel-home-harness', '')
  document.body.append(host)
  const source: SourceApi = createYoutubeSource({
    fetch: globalThis.fetch,
    createClient: async () => ({
      getChannel: async () => new YT.Channel(undefined as never, Parser.parseResponse(home as never), true),
    }) as never,
  })
  const yoga = createYoga<{ source: SourceApi }>({
    graphqlEndpoint: '/graphql',
    maskedErrors: false,
    schema: createSchema({ typeDefs, resolvers }),
  })
  const client = new Client({
    url: 'http://channel-home-harness.local/graphql',
    exchanges: [createCache(), fetchExchange],
    fetch: async (input, init) => yoga.handleRequest(new Request(input, init), { source }),
  })
  render(<Provider value={client}><ChannelPage params={{ channelId: MKBHD }} /></Provider>, host)
}
