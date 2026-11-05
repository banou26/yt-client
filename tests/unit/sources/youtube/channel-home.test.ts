import { describe, expect, it } from 'vite-plus/test'

// via the package surface: `exports` does not publish dist/, so a deep import does not resolve
import { Parser, YT } from 'youtubei.js'

import { createYoutubeSource } from '../../../../src/sources/youtube'
import fixture from '../../fixtures/channel-home.json'

/* channel-home.json is the signed-out browse of Linus Tech Tips captured on 2026-11-05, cut to one item per row and
   stripped of tracking and playback fields: the featured video, then a Videos row, a channels row, a Playlists row, a
   Shorts row, a Posts row and a Collaborations row. It runs through the real upstream parser, since the node shapes are
   what is read. The Channel has no actions, so any tab other than the one the browse landed on throws instead of
   browsing again. */

const CHANNEL_ID = 'UCXuqSBlHAE6Xw-yeJA0Tunw'

const sourceFor = () => createYoutubeSource({
  fetch: globalThis.fetch,
  createClient: async () => ({
    getChannel: async () => new YT.Channel(undefined as never, Parser.parseResponse(fixture as never), true),
  }) as never,
})

describe('channel Home tab', () => {
  it('opens on Home with the featured video and the rows in upstream order, off the one browse', async () => {
    const page = await sourceFor().channel(CHANNEL_ID)
    expect(page.tab).toBe('HOME')
    expect(page.availableTabs).toContain('VIDEOS')
    expect(page.videos.items).toEqual([])
    expect(page.home?.featured).toMatchObject({ id: 'IA9LlfQ9X-Q', title: 'I Bought EVERY Tech Ad I Saw for a MONTH' })
    // Collaborations follows the Shorts row upstream, so a read of all Shelf nodes and then all ReelShelf nodes puts it before Shorts
    expect(page.home?.shelves.map((shelf) => shelf.title)).toEqual(['Videos', 'Featured Channels', 'Playlists', 'Shorts', 'Collaborations'])
  })

  it('reads each row as the kind of item it holds', async () => {
    const [videos, channels, playlists, shorts] = (await sourceFor().channel(CHANNEL_ID)).home?.shelves ?? []
    expect(videos).toMatchObject({ url: '/@LinusTechTips/videos?view=0&sort=dd&shelf_id=4', videos: [{ id: 'AAraNufcrW4' }], playlists: [], channels: [] })
    expect(channels?.channels).toMatchObject([{ id: 'UCdBK94H6oZT2Q7l0-b0xmMg', subscriberCountText: '2.55M subscribers' }])
    expect(channels?.videos).toEqual([])
    expect(playlists?.playlists).toMatchObject([{ id: expect.stringMatching(/^PL/) }])
    expect(playlists?.videos).toEqual([])
    expect(shorts?.shorts).toMatchObject([{ id: '9st7OYkUHJk', isShort: true }])
  })

  // the avatar still taps through to the channel, so a byline read off the first part named the channel '775K'
  it('names no channel on the channel\'s own videos, whose one row is the views and the date', async () => {
    const page = await sourceFor().channel(CHANNEL_ID)
    const own = page.home?.shelves[0]?.videos[0]
    expect(own).toMatchObject({ id: 'AAraNufcrW4', viewCount: '775K', publishedText: '19h ago' })
    expect(own?.channel).toBeUndefined()
    expect(page.channel.name).toBe('Linus Tech Tips')
  })

  it('reads a collaboration\'s views and date off the row after its two names', async () => {
    const collaboration = (await sourceFor().channel(CHANNEL_ID)).home?.shelves.at(-1)?.videos[0]
    expect(collaboration).toMatchObject({ id: 'LttGyjX-QxE', viewCount: '2.1M', publishedText: '3w ago' })
  })
})
