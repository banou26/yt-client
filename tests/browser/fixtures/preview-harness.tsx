import type { SourceApi, SourceChannelPage } from '../../../src/sources/types'

import { createSchema, createYoga } from 'graphql-yoga'
import { render } from 'preact'
import { Client, fetchExchange, Provider } from 'urql'

import { VideoCard } from '../../../src/components/video-card'
import { createCache } from '../../../src/graphql'
import { ChannelPage } from '../../../src/routes/channel'
import SearchPage from '../../../src/routes/search'
import { createYoutubeSource } from '../../../src/sources/youtube'
import { resolvers } from '../../../src/worker/resolvers'
import typeDefs from '../../../src/worker/schema.gql?raw'

export const ROW_PARAMS = 'YAHIAQGiBhUBqHapM4pS7yURthtEeAtKvDyfuqPSBwkJ7hwBhyohjO8='
export const CARD_PARAMS = 'YAHIAQG6BQQSAmVuogYVAah2qTMljWapEebunsDzXCMdS7Rt0gcJCe4cAYcqIYzv'
// a live search row's own, off youtube.com's "lofi" search on 2026-11-11
export const LIVE_PARAMS = 'YAHIAQGiBhUBqHapMykbq0UjDjSaUZvbMaJKQiY='
// a one-pixel GIF, so the moving thumbnail loads with nothing asked of YouTube
export const MOVING = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

const channel = { id: 'channel-0', name: 'Channel 0' }

const searchRow = {
  __typename: 'Video',
  id: 'search-0',
  title: 'Guitar Lesson 1',
  inlinePlayerParams: ROW_PARAMS,
  description: null,
  descriptionSnippet: null,
  snippetRuns: null,
  thumbnail: null,
  thumbnailSrcset: null,
  durationSeconds: 754,
  isMusic: null,
  viewCount: '1.2M',
  publishedText: '2y ago',
  isLive: null,
  isUpcoming: null,
  isShort: null,
  badges: [],
  channel: { ...channel, avatar: null, isVerified: null, isVerifiedArtist: null },
  chapters: null,
  chaptersTitle: null,
  byline: null,
  collaborators: null,
}

// a Home card with its params, a channel upload with a moving thumbnail and none, and one with neither
const homeCard = { id: 'home-0', title: 'A Home card', durationSeconds: 600, inlinePlayerParams: CARD_PARAMS, channel }
const movingCard = { id: 'moving-0', title: 'A channel upload', durationSeconds: 300, animatedThumbnail: MOVING }
const stillCard = { id: 'still-0', title: 'An older channel upload', durationSeconds: 420 }

const liveRow = { ...searchRow, id: 'live-0', title: 'A live stream', inlinePlayerParams: LIVE_PARAMS, durationSeconds: null, isLive: true }
const liveCard = { id: 'live-1', title: 'A live Home card', inlinePlayerParams: LIVE_PARAMS, isLive: true, channel }

const answerSearch = (row: object) => async (_url: RequestInfo | URL, init?: RequestInit) => {
  const { operationName } = JSON.parse(init?.body as string) as { operationName: string }
  const data = operationName === 'SearchResults' ? { search: { results: [row], refinements: [], cursor: null, unwatchedChip: false } } : null
  return new Response(JSON.stringify({ data }), { headers: { 'content-type': 'application/json' } })
}

// served by the dev server and imported from a spec, to hover rows and cards with and without inline playback params,
// or a live row and card with theirs
export const mountPreviews = (live = false) => {
  document.getElementById('app')!.hidden = true
  const host = document.createElement('div')
  host.setAttribute('data-preview-harness', '')
  host.style.width = '1200px'
  document.body.append(host)
  const fetch = answerSearch(live ? liveRow : searchRow)
  const client = new Client({ url: '/preview-harness', exchanges: [fetchExchange], fetch, preferGetMethod: false })
  render(
    <Provider value={client}>
      <section data-previews='cards' style={{ display: 'grid', gridTemplateColumns: '360px 360px 360px', gap: '16px' }}>
        {live
          ? <VideoCard video={liveCard} />
          : (
            <>
              <VideoCard video={homeCard} />
              <VideoCard video={movingCard} variant='channel' />
              <VideoCard video={stillCard} variant='channel' />
            </>
          )}
      </section>
      <section data-previews='search'>
        <SearchPage />
      </section>
    </Provider>,
    host,
  )
}

const CHANNEL_ID = 'UCSMOQeBJ2RAnuFungnQOxLg'

// a channel's page as the worker answers it, through the app's own schema, resolvers and cache: its one upload carries
// a moving thumbnail and no params, as a channel's Home rows and Videos tab do on youtube.com
export const mountChannel = (tab: 'HOME' | 'VIDEOS') => {
  document.getElementById('app')!.hidden = true
  const host = document.createElement('div')
  host.setAttribute('data-preview-harness', '')
  host.style.width = '1200px'
  document.body.append(host)
  const upload = { id: 'moving-0', title: 'A channel upload', durationSeconds: 300, animatedThumbnail: MOVING, badges: [] }
  const page: SourceChannelPage = {
    channel: { id: CHANNEL_ID, name: 'Channel 0' },
    videos: { items: tab === 'VIDEOS' ? [upload] : [], playlists: [] },
    availableTabs: ['HOME', 'VIDEOS'],
    tab,
    sortOptions: [],
    sortMenu: false,
    filterOptions: [],
    home: tab === 'HOME'
      ? { shelves: [{ title: 'Videos', uploads: true, videos: [upload], shorts: [], playlists: [], channels: [], games: [], posts: [] }] }
      : undefined,
  }
  const source = {
    ...createYoutubeSource({ fetch: globalThis.fetch, createClient: async () => ({}) as never }),
    channel: async () => page,
  } as SourceApi
  const yoga = createYoga<{ source: SourceApi }>({
    graphqlEndpoint: '/graphql',
    maskedErrors: false,
    schema: createSchema({ typeDefs, resolvers }),
  })
  const client = new Client({
    url: 'http://preview-harness.local/graphql',
    exchanges: [createCache(), fetchExchange],
    fetch: async (input, init) => yoga.handleRequest(new Request(input, init), { source }),
  })
  render(<Provider value={client}><ChannelPage id={CHANNEL_ID} base={`/channel/${CHANNEL_ID}`} tab={tab} /></Provider>, host)
}
