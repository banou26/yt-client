import { describe, expect, it } from 'vite-plus/test'

import { Parser, YT } from 'youtubei.js'

import { createYoutubeSource } from '../../../../src/sources/youtube'
import channelVideos from '../../fixtures/channel-videos-blender.json'
import home from '../../fixtures/home-inline-preview.json'
import search from '../../fixtures/search-inline-preview.json'

/* search-inline-preview.json is the signed-out WEB search for "guitar lesson" captured on 2026-11-10, cut to its first
   three rows; every row of that answer carried an inline-playback endpoint, and the third row's was removed, as a row
   upstream sends without one. home-inline-preview.json is youtube.com's signed-out Home after two watched videos,
   captured the same day, cut to two recommendations, whose params sit on each lockup's item playback. Both are
   stripped of tracking fields and the onesie playback URL, and run through the real upstream parser, so they fail
   without the youtubei.js patch in patches/ as much as without the normalizers. */

const sourceFor = (client: object) => createYoutubeSource({ fetch: globalThis.fetch, createClient: async () => client as never })

describe("a card's inline playback params", () => {
  it('are read off a search row\'s inline-playback endpoint, decoded, and absent on a row with none', async () => {
    const parsed = new YT.Search(undefined as never, Parser.parseResponse(search as never), true)
    const { results } = await sourceFor({ search: async () => parsed }).search('guitar lesson')
    expect(results.map((result) => result.kind === 'video' ? [result.id, result.inlinePlayerParams] : result.kind)).toEqual([
      ['BBz-Jyr23M4', 'YAHIAQGiBhUBqHapM4pS7yURthtEeAtKvDyfuqPSBwkJ7hwBhyohjO8='],
      ['jq0ZAc97cAY', 'YAHIAQGiBhUBqHapM460cO611cWYYNLC7NuOcLk='],
      ['vnBd5kL7ynE', undefined],
    ])
  })

  it('are read off a Home lockup\'s item playback', async () => {
    const feed = new YT.HomeFeed({} as never, { data: home } as never)
    const { items } = await sourceFor({ getHomeFeed: async () => feed }).home()
    expect(items.map(({ id, inlinePlayerParams }) => [id, inlinePlayerParams])).toEqual([
      ['F0OkwXKcPSE', 'YAHIAQG6BQQSAmVuogYVAah2qTMljWapEebunsDzXCMdS7Rt0gcJCe4cAYcqIYzv'],
      ['49_Ph2q6uIM', 'YAHIAQG6BQcSBWVuLVVTogYVAah2qTO-oHm9XTru9fnNGyqzUZ5S'],
    ])
  })

  it('are absent on a channel\'s Videos tab, whose lockups carry none', async () => {
    const tab = new YT.Channel(undefined as never, Parser.parseResponse(channelVideos as never), true)
    const page = await sourceFor({ getChannel: async () => tab }).channel('UCSMOQeBJ2RAnuFungnQOxLg', 'VIDEOS')
    expect(page.videos.items).toHaveLength(4)
    expect(page.videos.items.map((video) => video.inlinePlayerParams)).toEqual([undefined, undefined, undefined, undefined])
  })
})
