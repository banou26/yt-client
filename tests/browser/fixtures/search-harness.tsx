import { render } from 'preact'
import { Client, fetchExchange, Provider } from 'urql'

import { createCache } from '../../../src/graphql'
import SearchPage from '../../../src/routes/search'

const channel = (id: string, name: string) => ({ __typename: 'Channel', id, name, avatar: null, isVerified: true, isVerifiedArtist: null })

const video = (id: string, title: string) => ({
  __typename: 'Video',
  id,
  title,
  inlinePlayerParams: null,
  description: null,
  descriptionSnippet: null,
  snippetRuns: null,
  thumbnail: null,
  thumbnailSrcset: null,
  durationSeconds: 1729,
  isMusic: null,
  viewCount: '95K',
  publishedText: '2w ago',
  isLive: null,
  isUpcoming: null,
  isShort: null,
  badges: [],
  channel: channel('UCkjxZqW8zRi4rexA3TMvmrA', 'ECKOSOLDIER'),
  chapters: null,
  chaptersTitle: null,
  byline: null,
  collaborators: null,
})

const topicVideo = (id: string, title: string, rest: { durationSeconds: number | null, subtitle: string | null, scheduledAt: string | null }) => ({
  __typename: 'TopicVideo',
  id,
  title,
  thumbnail: null,
  ...rest,
  channel: { __typename: 'Channel', id: 'UC1sELGmy5jp5fQUugmuYlXQ', name: 'Minecraft' },
})

// a Short as a carousel holds it, with no length
const short = { ...video('YsohTIAJJFs', 'Backrooms easter egg (Actions and stuff V1.12 Minecraft)'), durationSeconds: null, isShort: true }

// the first page of a search for "minecraft" as the worker answers it: a row, a carousel of six cards whose last is a
// Short, a row, and the topic card with one scheduled video and one that is out
const answer = {
  search: {
    __typename: 'SearchPage',
    results: [
      video('cJj0iit4dYI', 'I Can Shapeshift Into MONSTERS to PRANK Villagers In Minecraft'),
      {
        __typename: 'SearchShelf',
        title: 'Minecraft Addon',
        subtitle: 'People also search for',
        horizontal: true,
        collapsedCount: null,
        videos: [
          ...['5LP8rAcpDGo', '7Qo-27gyiik', 'h-vf10hoOfg', 'u00eNCXwD0A', '_58nP1Ie9EM']
            .map((id, index) => video(id, `Minecraft Bedrock addon ${index + 1}`)),
          short,
        ],
        shorts: [],
      },
      video('BTfFrSnVJTc', 'MINECRAFT JUST OVERHAULED THE SECRET WORLD'),
    ],
    topic: {
      __typename: 'SearchTopic',
      title: 'Minecraft',
      subtitle: 'Video game • Released: 2009',
      channelId: 'UCQvWX73GQygcwXOTSf_VDVg',
      hero: { __typename: 'TopicVideo', id: '8JGY7vGkMX0', title: 'Introducing Minecraft Realms Pro', thumbnail: null, subtitle: 'Minecraft • 170K • 11h ago' },
      videos: [
        topicVideo('FA_rn1PKtZY', 'The POW Show: Challenges & Trivia', { durationSeconds: null, subtitle: null, scheduledAt: '2026-11-16T00:00:00.000Z' }),
        topicVideo('E1eJz7IC4Tk', 'Minecraft Dungeons II: Surprise Showcase', { durationSeconds: 28, subtitle: '301K • 3d ago', scheduledAt: null }),
      ],
    },
    refinements: [],
    cursor: null,
    unwatchedChip: true,
  },
}

const fetchAnswer = async (_url: RequestInfo | URL, init?: RequestInit) => {
  const { operationName } = JSON.parse(init?.body as string) as { operationName: string }
  return new Response(JSON.stringify({ data: operationName === 'SearchResults' ? answer : null }), { headers: { 'content-type': 'application/json' } })
}

// served by the dev server and imported from a spec, to render the search page against a fixed answer through the app's
// cache. The app's own page is hidden, so its guide does not lie over the carousel's Previous arrow.
export const mountSearch = () => {
  document.getElementById('app')!.hidden = true
  const host = document.createElement('div')
  host.setAttribute('data-search-harness', '')
  document.body.append(host)
  const client = new Client({ url: '/search-harness', exchanges: [createCache(), fetchExchange], fetch: fetchAnswer, preferGetMethod: false })
  render(
    <Provider value={client}>
      <SearchPage />
    </Provider>,
    host,
  )
}
