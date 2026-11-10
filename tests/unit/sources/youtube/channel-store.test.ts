import { describe, expect, it } from 'vite-plus/test'

// via the package surface: `exports` does not publish dist/, so a deep import does not resolve
import { Parser, YT } from 'youtubei.js'

import { createYoutubeSource } from '../../../../src/sources/youtube'
import fixture from '../../fixtures/channel-store.json'

/* channel-store.json holds the signed-out browses of the Store tabs of MKBHD (one Featured grid, cut to three of its six
   products) and Linus Tech Tips (a Just dropped row that scrolls, then a Featured grid, cut to one product each),
   captured on 2026-11-10 and stripped of the header and of tracking fields. Each runs through the real upstream parser,
   and each Channel landed on its Store tab. */

const sourceFor = (answer: unknown) => createYoutubeSource({
  fetch: globalThis.fetch,
  createClient: async () => ({
    getChannel: async () => new YT.Channel(undefined as never, Parser.parseResponse(answer as never), true),
  }) as never,
})

describe('a channel\'s Store tab', () => {
  it('comes last among the tabs, as on youtube.com', async () => {
    const page = await sourceFor(fixture.mkbhd).channel('UCBJycsmduvYEL83R_U4JriQ', 'STORE')
    expect(page.availableTabs).toEqual(['HOME', 'VIDEOS', 'SHORTS', 'LIVE', 'SHOWS', 'PLAYLISTS', 'COMMUNITY', 'STORE', 'SEARCH'])
    expect(page.tab).toBe('STORE')
  })

  it('lists the products with the price, or Unavailable in its place, and links to each one\'s page on its store', async () => {
    const page = await sourceFor(fixture.mkbhd).channel('UCBJycsmduvYEL83R_U4JriQ', 'STORE')
    expect(page.videos.items).toEqual([])
    expect(page.store?.map(({ title, scrolls }) => ({ title, scrolls }))).toEqual([{ title: 'Featured', scrolls: undefined }])
    const [unavailable, sticker] = page.store?.[0]?.products ?? []
    expect(unavailable).toMatchObject({
      title: 'Ridge Power Bank - 10k mAh - Phantom',
      price: 'Unavailable',
      priceNote: undefined,
      merchant: 'From The Ridge',
      url: expect.stringMatching(/^https:\/\/ridge\.com\/products\/magnetic-power-bank-phantom\?/),
    })
    expect(sticker).toMatchObject({
      title: 'Color Picker Sticker Pack',
      price: '¥1,265',
      priceNote: '(taxes included) + additional fees',
      merchant: 'From MKBHD',
      url: expect.stringMatching(/^https:\/\/mkbhd\.com\/products\/color-picker-sticker-pack\?/),
      thumbnail: expect.stringMatching(/^https:\/\/encrypted-tbn0\.gstatic\.com\/shopping\?/),
    })
    expect(page.store?.[0]?.products).toHaveLength(3)
  })

  it('keeps a row that scrolls apart from a grid', async () => {
    const page = await sourceFor(fixture.ltt).channel('UCXuqSBlHAE6Xw-yeJA0Tunw', 'STORE')
    expect(page.store?.map(({ title, scrolls, products }) => ({ title, scrolls, count: products.length }))).toEqual([
      { title: 'Just dropped', scrolls: true, count: 1 },
      { title: 'Featured', scrolls: undefined, count: 1 },
    ])
  })
})
