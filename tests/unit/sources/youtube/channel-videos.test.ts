import { describe, expect, it } from 'vite-plus/test'

import { Parser, YT } from 'youtubei.js'

import { createYoutubeSource } from '../../../../src/sources/youtube'
import fixture from '../../fixtures/channel-videos-blender.json'

/* channel-videos-blender.json is the signed-out browse of Blender's Videos tab captured on 2026-11-09, cut to four
   videos (the last a collaboration with another channel) and stripped of tracking and playback fields. Each video's one
   metadata row is its views and date, after the two names on the collaboration. */

const BLENDER = 'UCSMOQeBJ2RAnuFungnQOxLg'

const sourceFor = () => createYoutubeSource({
  fetch: globalThis.fetch,
  createClient: async () => ({
    getChannel: async () => new YT.Channel(undefined as never, Parser.parseResponse(fixture as never), true),
  }) as never,
})

describe('channel Videos tab', () => {
  it('reads each video\'s views and date off its one row, a collaboration\'s after the two names', async () => {
    const page = await sourceFor().channel(BLENDER, 'VIDEOS')
    expect(page.tab).toBe('VIDEOS')
    expect(page.videos.items.map(({ id, viewCount, publishedText, channel }) => ({ id, viewCount, publishedText, channel })))
      .toEqual([
        { id: 'mHrHLqQj7Ts', viewCount: '17K', publishedText: '6d ago', channel: undefined },
        { id: 'dVrELpmfcEQ', viewCount: '12K', publishedText: '2w ago', channel: undefined },
        { id: 'sO_lhW8av3U', viewCount: '23K', publishedText: '3w ago', channel: undefined },
        { id: 'cM3NJuY_xLc', viewCount: '10K', publishedText: '1mo ago', channel: undefined },
      ])
  })
})
