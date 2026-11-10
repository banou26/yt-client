import type { ChannelTab } from '../../../src/generated/graphql'
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
import liveChips from '../../unit/fixtures/channel-live-chips-mkbhd.json'
import liveDropdown from '../../unit/fixtures/channel-live-mkbhd.json'

export const MKBHD = 'UCBJycsmduvYEL83R_U4JriQ'

type Answers = Record<string, unknown>

const walk = (node: unknown, visit: (node: Record<string, unknown>) => void) => {
  if (!node || typeof node !== 'object') return
  visit(node as Record<string, unknown>)
  for (const value of Object.values(node)) walk(value, visit)
}

// the continuation a chip or a dropdown row labelled `label` sends in `answer`
const tokenOf = (answer: unknown, label: string) => {
  let token: string | undefined
  walk(answer, (node) => {
    const chip = node.chipViewModel as { text?: string, tapCommand?: unknown } | undefined
    const row = node.listItemViewModel as { title?: { content?: string } } | undefined
    if (chip?.text !== label && row?.title?.content !== label) return
    walk(chip?.tapCommand ?? row, (inner) => {
      token ??= (inner.continuationCommand as { token?: string } | undefined)?.token
    })
  })
  if (!token) throw new Error(`no ${label} in the recorded answer`)
  return token
}

// served by the dev server and imported from a spec, to render a channel from recorded answers through the app's own
// schema, resolvers and cache. `first` opens the page, and each route names the answer a chip or row of another one brings.
const mountChannel = (harness: string, answers: Answers, first: string, routes: [string, string, string][] = [], tab?: ChannelTab) => {
  const host = document.createElement('div')
  host.setAttribute(harness, '')
  document.body.append(host)
  const recorded = routes.map(([from, label, to]) => [tokenOf(answers[from], label), to] as const)
  const actions = {
    session: { logged_in: false },
    execute: async (_path: string, args: Record<string, unknown>) => {
      const answer = recorded.find(([token]) => token === args.continuation)?.[1]
      if (!answer) throw new Error(`unrecorded continuation ${String(args.continuation)}`)
      return Parser.parseResponse(answers[answer] as never)
    },
  }
  const source: SourceApi = createYoutubeSource({
    fetch: globalThis.fetch,
    createClient: async () => ({
      getChannel: async () => new YT.Channel(actions as never, Parser.parseResponse(answers[first] as never), true),
    }) as never,
  })
  const yoga = createYoga<{ source: SourceApi }>({
    graphqlEndpoint: '/graphql',
    maskedErrors: false,
    schema: createSchema({ typeDefs, resolvers }),
  })
  const client = new Client({
    url: 'http://channel-harness.local/graphql',
    exchanges: [createCache(), fetchExchange],
    fetch: async (input, init) => yoga.handleRequest(new Request(input, init), { source }),
  })
  render(<Provider value={client}><ChannelPage id={MKBHD} base={`/channel/${MKBHD}`} tab={tab} /></Provider>, host)
}

// channel-home-mkbhd.json holds one video in two rows, which the cache keeps as one video
export const mountChannelHome = () => mountChannel('data-channel-home-harness', { home }, 'home')

export const mountChannelLiveDropdown = () => mountChannel('data-channel-live-harness', liveDropdown, 'latest', [
  ['latest', 'Popular', 'popular'],
  ['latest', 'Members only', 'members'],
  ['popular', 'Members only', 'popularMembers'],
], 'LIVE')

export const mountChannelLiveChips = () =>
  mountChannel('data-channel-live-harness', liveChips, 'latest', [['latest', 'Popular', 'popular']], 'LIVE')
