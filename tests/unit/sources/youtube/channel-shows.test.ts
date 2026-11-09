import { describe, expect, it } from 'vite-plus/test'

// via the package surface: `exports` does not publish dist/, so a deep import does not resolve
import { Parser, YT } from 'youtubei.js'

import { createYoutubeSource } from '../../../../src/sources/youtube'
import fixture from '../../fixtures/channel-shows-mkbhd.json'

/* channel-shows-mkbhd.json holds the signed-out browses of MKBHD's Playlists and Shows tabs captured on 2026-11-10
   (English, United States), stripped of the header and of tracking fields. The Playlists tab is cut to three of its 23
   lockups: two shows (series counted in episodes) around a plain playlist. The Shows tab is cut to two of its eight
   shows. Both run through the real upstream parser, and each Channel landed on the tab under test. */

const MKBHD = 'UCBJycsmduvYEL83R_U4JriQ'

const sourceFor = (answer: unknown) => createYoutubeSource({
  fetch: globalThis.fetch,
  createClient: async () => ({
    getChannel: async () => new YT.Channel(undefined as never, Parser.parseResponse(answer as never), true),
  }) as never,
})

const listed = (playlists: { id: string, title: string, videoCountText?: string }[]) =>
  playlists.map(({ id, title, videoCountText }) => ({ id, title, videoCountText }))

describe('a channel\'s shows', () => {
  it('has a Shows tab where youtube.com shows one, between Live and Playlists', async () => {
    const page = await sourceFor(fixture.playlists).channel(MKBHD, 'PLAYLISTS')
    expect(page.availableTabs).toEqual(['HOME', 'VIDEOS', 'SHORTS', 'LIVE', 'SHOWS', 'PLAYLISTS', 'COMMUNITY', 'SEARCH'])
  })

  it('keeps the shows on the Playlists tab, counted in episodes', async () => {
    const page = await sourceFor(fixture.playlists).channel(MKBHD, 'PLAYLISTS')
    expect(page.tab).toBe('PLAYLISTS')
    expect(listed(page.videos.playlists)).toEqual([
      { id: 'PLBsP89CPrMeNIuvr9j3_EQaMwaNJ6rhuQ', title: 'Retro Tech S2', videoCountText: '5 episodes' },
      { id: 'PLBsP89CPrMeMV1oP42Zn2DrWpnFoSaufA', title: 'Retro Tech', videoCountText: '6 videos' },
      { id: 'PLBsP89CPrMePNK7yIxcyRdiIFentQVHra', title: 'MKBHD Interviews!', videoCountText: '13 episodes' },
    ])
  })

  it('lists the Shows tab as the playlists the shows open', async () => {
    const page = await sourceFor(fixture.shows).channel(MKBHD, 'SHOWS')
    expect(page.tab).toBe('SHOWS')
    expect(listed(page.videos.playlists)).toEqual([
      { id: 'PLBsP89CPrMeNIuvr9j3_EQaMwaNJ6rhuQ', title: 'Retro Tech S2', videoCountText: '5 episodes' },
      { id: 'PLBsP89CPrMeO7uztAu6YxSB10cRMpjgiY', title: 'Retro Tech', videoCountText: '11 episodes' },
    ])
    expect(page.videos.playlists[0]?.thumbnail).toContain('i.ytimg.com/vi/ifI_fwg55k8/')
  })
})
