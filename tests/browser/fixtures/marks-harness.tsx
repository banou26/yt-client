import { render } from 'preact'
import { Client, fetchExchange, Provider } from 'urql'

import { VideoCard } from '../../../src/components/video-card'
import { VideoCardCompact } from '../../../src/components/video-card-compact'
import SearchPage from '../../../src/routes/search'

const channel = { id: 'channel-0', name: 'Channel 0' }

// a row carrying every mark, as a related lockup answers them, one carrying none, as an answer without a delimiter
// does, and a members-only stream, as a channel's Live tab answers it
const marked = {
  id: 'marked-0',
  title: 'A new song',
  thumbnailBadge: 'New',
  durationSeconds: 204,
  isMusic: true,
  viewCount: '208M',
  viewCountIcon: true,
  publishedText: '17y ago',
  metaDelimiter: ' ',
  channel,
}
const plain = { id: 'plain-0', title: 'A talk', durationSeconds: 2124, viewCount: '3.9M', publishedText: '14h ago', channel }
const members = {
  id: 'members-0',
  title: 'May the 4th Be With You!',
  durationSeconds: 2491,
  publishedText: 'Streamed 4y ago',
  metaDelimiter: ' ',
  isMembersOnly: true,
  channel,
}

const searchRow = {
  __typename: 'Video',
  id: 'search-0',
  title: 'Never Gonna Give You Up',
  description: 'The official video for Never Gonna Give You Up by Rick Astley.',
  descriptionSnippet: null,
  snippetRuns: [
    { text: 'The official video for ', bold: null },
    { text: 'Never Gonna Give You Up', bold: true },
    { text: ' by Rick Astley.', bold: null },
  ],
  thumbnail: null,
  thumbnailSrcset: null,
  durationSeconds: 214,
  isMusic: true,
  viewCount: '1.8B',
  publishedText: '17y ago',
  isLive: null,
  isUpcoming: null,
  badges: [],
  channel: { ...channel, avatar: null, isVerified: null, isVerifiedArtist: null },
}

const answerWith = (unwatchedChip: boolean) => async (_url: RequestInfo | URL, init?: RequestInit) => {
  const { operationName } = JSON.parse(init?.body as string) as { operationName: string }
  const data = operationName === 'SearchResults' ? { search: { results: [searchRow], refinements: [], cursor: null, unwatchedChip } } : null
  return new Response(JSON.stringify({ data }), { headers: { 'content-type': 'application/json' } })
}

// served by the dev server and imported from a spec, to render each kind of row against fixed answers
export const mountMarks = ({ unwatchedChip = true }: { unwatchedChip?: boolean } = {}) => {
  const host = document.createElement('div')
  host.setAttribute('data-marks-harness', '')
  host.style.width = '1200px'
  document.body.append(host)
  const client = new Client({ url: '/marks-harness', exchanges: [fetchExchange], fetch: answerWith(unwatchedChip), preferGetMethod: false })
  render(
    <Provider value={client}>
      <section data-marks='compact' style={{ width: '400px' }}>
        <VideoCardCompact video={marked} />
        <VideoCardCompact video={plain} />
        <VideoCardCompact video={members} />
      </section>
      <section data-marks='grid' style={{ display: 'grid', gridTemplateColumns: '360px 360px', gap: '16px' }}>
        <VideoCard video={marked} variant='channel' />
        <VideoCard video={plain} variant='channel' />
        <VideoCard video={members} variant='channel' />
      </section>
      <section data-marks='search'>
        <SearchPage />
      </section>
    </Provider>,
    host,
  )
}
