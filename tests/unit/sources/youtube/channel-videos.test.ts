import { describe, expect, it } from 'vite-plus/test'

import { Parser, YT } from 'youtubei.js'

import { createYoutubeSource } from '../../../../src/sources/youtube'
import fixture from '../../fixtures/channel-videos-blender.json'

/* channel-videos-blender.json is the signed-out browse of Blender's Videos tab captured on 2026-11-09, cut to four
   videos (the last a collaboration with another channel) and stripped of tracking and playback fields. Each video's one
   metadata row is its views and date, after the two names on the collaboration. */

const BLENDER = 'UCSMOQeBJ2RAnuFungnQOxLg'

const parsed = () => new YT.Channel(undefined as never, Parser.parseResponse(fixture as never), true)

const sourceFor = (getChannel: () => YT.Channel = parsed) => createYoutubeSource({
  fetch: globalThis.fetch,
  createClient: async () => ({ getChannel: async () => getChannel() }) as never,
})

// The recording has no continuation, so this tab says it has one and serves the same four videos as its next page
const withNextPage = () => {
  const tab = parsed()
  Object.defineProperty(tab, 'getVideos', { value: async () => tab })
  Object.defineProperty(tab, 'has_continuation', { value: true })
  Object.defineProperty(tab, 'getContinuation', { value: async () => parsed() })
  return tab
}

const stats = (items: { id: string, viewCount?: string, publishedText?: string, channel?: unknown }[]) =>
  items.map(({ id, viewCount, publishedText, channel }) => ({ id, viewCount, publishedText, channel }))

const BLENDER_STATS = [
  { id: 'mHrHLqQj7Ts', viewCount: '17K', publishedText: '6d ago', channel: undefined },
  { id: 'dVrELpmfcEQ', viewCount: '12K', publishedText: '2w ago', channel: undefined },
  { id: 'sO_lhW8av3U', viewCount: '23K', publishedText: '3w ago', channel: undefined },
  { id: 'cM3NJuY_xLc', viewCount: '10K', publishedText: '1mo ago', channel: undefined },
]

describe('channel Videos tab', () => {
  it('reads each video\'s views and date off its one row, a collaboration\'s after the two names', async () => {
    const page = await sourceFor().channel(BLENDER, 'VIDEOS')
    expect(page.tab).toBe('VIDEOS')
    expect(stats(page.videos.items)).toEqual(BLENDER_STATS)
  })

  it('reads the views and date the same way on the pages after the first', async () => {
    const source = sourceFor(withNextPage)
    const page = await source.channel(BLENDER, 'VIDEOS')
    expect(page.videos.cursor).toBeDefined()
    const next = await source.channel(BLENDER, 'VIDEOS', undefined, undefined, page.videos.cursor)
    expect(stats(next.videos.items)).toEqual(BLENDER_STATS)
  })
})
