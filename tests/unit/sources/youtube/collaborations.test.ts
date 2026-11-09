import type { SourceChannelShelf, SourceVideo } from '../../../../src/sources/types'

import { describe, expect, it } from 'vite-plus/test'

import { Parser, YT } from 'youtubei.js'

import { rowByline } from '../../../../src/components/format'
import { createYoutubeSource } from '../../../../src/sources/youtube'
import { normalizeLockupVideo, normalizeWatchMeta } from '../../../../src/sources/youtube/normalize'
import home from '../../fixtures/channel-home-mkbhd.json'
import blender from '../../fixtures/channel-videos-blender.json'
import threeChannels from '../../fixtures/search-colin-and-samir.json'
import search from '../../fixtures/search-collaboration.json'
import watch from '../../fixtures/watch-collaboration.json'

/* Signed-out answers captured on 2026-11-10 and stripped of tracking, menus and playback fields:
   - search-collaboration.json, the search for "quantum computing explained" cut to a 3Blue1Brown row and Cleo Abram's
     video with Marques Brownlee, whose byline opens a Collaborators dialog instead of a channel;
   - search-colin-and-samir.json, the search for "colin and samir" cut to a video of three channels;
   - channel-home-mkbhd.json, Marques Brownlee's Home cut to its Videos row (two of his own videos and one with Auto
     Focus), its First Impressions row (one of those two and the one with Auto Focus) and its Collaborations row;
   - watch-collaboration.json, the /next of Cleo Abram's video with Marques Brownlee cut to its title and its owner,
     whose avatars, names and Subscribe all open the Collaborators dialog, with a Subscribe on each channel. */

const MKBHD = 'UCBJycsmduvYEL83R_U4JriQ'
const CLEO = 'UC415bOPUcGSamy543abLmRA'

const searchFor = async (answer: unknown) => {
  const source = createYoutubeSource({
    fetch: globalThis.fetch,
    createClient: async () => ({ search: async () => new YT.Search(undefined as never, Parser.parseResponse(answer as never), true) }) as never,
  })
  const { results } = await source.search('query')
  return (id: string) => results.find((result): result is SourceVideo & { kind: 'video' } => result.kind === 'video' && result.id === id)
}

const homeShelves = async () => {
  const source = createYoutubeSource({
    fetch: globalThis.fetch,
    createClient: async () => ({
      getChannel: async () => new YT.Channel(undefined as never, Parser.parseResponse(home as never), true),
    }) as never,
  })
  return (await source.channel(MKBHD)).home?.shelves ?? []
}

// the app's cache keeps one video per id, with the fields of the last row that wrote it (src/graphql.ts)
const cached = (shelves: SourceChannelShelf[]) => {
  const videos = new Map<string, SourceVideo>()
  for (const video of shelves.flatMap((shelf) => shelf.videos)) videos.set(video.id, { ...videos.get(video.id), ...video })
  return videos
}

const printed = (shelf: SourceChannelShelf, videos: Map<string, SourceVideo>) =>
  shelf.videos.map(({ id }) => {
    const video = videos.get(id)!
    const kind = rowByline(video, shelf.uploads)
    if (kind === 'names') return video.byline?.map((part) => part.text).join(' ')
    return kind === 'channel' ? video.channel?.name : undefined
  })

describe('a video two channels made', () => {
  it('keeps a search row\'s byline and the channels its dialog lists, the first as its channel', async () => {
    const row = await searchFor(search)
    expect(row('e3fz3dqhN44')).toMatchObject({
      channel: { id: CLEO, name: 'Cleo Abram' },
      byline: [{ text: 'Cleo Abram', isVerified: true }, { text: 'and Marques Brownlee', isVerified: true }],
      collaborators: [
        { id: CLEO, name: 'Cleo Abram', handle: '@CleoAbram', subscriberCountText: '8.94M subscribers', isVerified: true, avatar: expect.stringMatching(/^https:\/\/yt3\./) },
        { id: MKBHD, name: 'Marques Brownlee', handle: '@mkbhd', subscriberCountText: '21.4M subscribers', isVerified: true },
      ],
    })
    const single = row('RQWpF2Gb-gU')
    expect(single?.channel).toMatchObject({ id: 'UCYO_jab_esuFRV4b17AJtAw', name: '3Blue1Brown' })
    expect(single?.byline).toBeUndefined()
    expect(single?.collaborators).toBeUndefined()
  })

  it('cuts a search row\'s byline after the first name, which can hold an "and" itself', async () => {
    const row = (await searchFor(threeChannels))('TIqA43EeVLI')
    expect(row?.byline).toEqual([
      { text: 'Colin and Samir', isVerified: true, isVerifiedArtist: undefined },
      { text: 'and 2 more', isVerified: undefined, isVerifiedArtist: undefined },
    ])
    expect(row?.collaborators?.map((channel) => channel.name)).toEqual(['Colin and Samir', 'SubwayTakes with Kareem Rahma', 'Kareem Rahma'])
  })

  it('keeps a Home row\'s names and the channels its avatars list', async () => {
    const [videos] = await homeShelves()
    expect(videos?.videos.find((video) => video.id === 'scwlR0QHGOk')).toMatchObject({
      viewCount: '12M',
      publishedText: '3w ago',
      // its row sends no delimiter, and youtube.com still parts the views and date with the gap
      metaDelimiter: ' ',
      channel: { id: MKBHD, name: 'Marques Brownlee' },
      byline: [{ text: 'Marques Brownlee', isVerified: true }, { text: 'and Auto Focus', isVerified: true }],
      collaborators: [{ id: MKBHD, handle: '@mkbhd' }, { name: 'Auto Focus', handle: '@AutoFocus' }],
    })
  })

  // The same video in the Videos row and in First Impressions is one cached video, so the Videos row read the name
  // First Impressions gave it on 5 of 12 rows (2026-11-10)
  it('prints no name on the channel\'s own uploads, a collaboration\'s names on every row', async () => {
    const shelves = await homeShelves()
    expect(shelves.map((shelf) => [shelf.title, shelf.uploads])).toEqual([
      ['Videos', true],
      ['First Impressions!', undefined],
      ['Collaborations', undefined],
    ])
    const videos = cached(shelves)
    expect(shelves.map((shelf) => printed(shelf, videos))).toEqual([
      [undefined, undefined, 'Marques Brownlee and Auto Focus'],
      ['Marques Brownlee', 'Marques Brownlee and Auto Focus'],
      ['Marques Brownlee and Auto Focus', 'Mrwhosetheboss and Marques Brownlee'],
    ])
  })

  it('names a watch page\'s channels, and reads each one\'s subscribe state only from a signed-in answer', () => {
    const meta = normalizeWatchMeta(Parser.parseResponse(watch as never), 'e3fz3dqhN44')
    expect(meta).toMatchObject({
      title: 'Quantum Computers, explained with MKBHD',
      channel: { id: CLEO, name: 'Cleo Abram' },
      byline: [{ text: 'Cleo Abram', isVerified: true }, { text: 'and Marques Brownlee', isVerified: true }],
      collaborators: [
        { id: CLEO, name: 'Cleo Abram', handle: '@CleoAbram', subscriberCountText: '8.95M subscribers', isVerified: true, isSubscribed: undefined },
        { id: MKBHD, name: 'Marques Brownlee', handle: '@mkbhd', subscriberCountText: '21.4M subscribers', isVerified: true, isSubscribed: undefined },
      ],
    })

    const signedIn = JSON.parse(JSON.stringify(watch).replaceAll('"isSignedOut":true', '"isSignedOut":false').replace('"subscribed":false', '"subscribed":true'))
    expect(normalizeWatchMeta(Parser.parseResponse(signedIn), 'e3fz3dqhN44')?.collaborators?.map((channel) => channel.isSubscribed)).toEqual([true, false])
  })

  // the layout of a lockup in history or a lockup search: names, views and date on one row
  it('keeps a one-row lockup\'s later names out of its views and date', () => {
    const parsed = Parser.parseResponse(blender as never)
    const lockup = (parsed.contents_memo?.get('LockupView') ?? []).find((node) => (node as { content_id?: string }).content_id === 'cM3NJuY_xLc')
    expect(normalizeLockupVideo(lockup)).toMatchObject({
      viewCount: '10K',
      publishedText: '1mo ago',
      byline: [{ text: 'Blender', isVerified: true }, { text: 'and Invicta', isVerified: true }],
    })
  })
})
