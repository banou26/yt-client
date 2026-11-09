import type { SourceSearchResult } from '../../../../src/sources/types'

import { describe, expect, it } from 'vite-plus/test'

// via the package surface: `exports` does not publish dist/, so a deep import does not resolve
import { Parser, YT, YTNodes } from 'youtubei.js'

import { createYoutubeSource } from '../../../../src/sources/youtube'
import { normalizeSearchCard } from '../../../../src/sources/youtube/normalize'
import fixture from '../../fixtures/search-rick-astley.json'

/* search-rick-astley.json is the signed-out search for "rick astley" captured on 2026-11-09, cut to the artist card (its
   Mix and three videos), two result rows, the "Latest from Rick Astley" shelf and two Shorts shelves of three, and
   stripped of tracking, playback and visitor fields. It runs through the real upstream parser, which is what proves the
   youtubei.js patch in patches/ is applied: without it the card is a class built at runtime and logged as missing. */

const parse = (response: unknown = fixture) => new YT.Search(undefined as never, Parser.parseResponse(response as never), true)

const sourceFor = (response?: unknown) => createYoutubeSource({
  fetch: globalThis.fetch,
  createClient: async () => ({ search: async () => parse(response) }) as never,
})

const search = async (response?: unknown) => (await sourceFor(response).search('rick astley')).results

const cardOf = (results: SourceSearchResult[]) => {
  const card = results.find((result) => result.kind === 'card')
  if (card?.kind !== 'card') throw new Error('no card')
  return card
}

const signedIn = (subscribed: boolean): unknown => JSON.parse(
  JSON.stringify(fixture)
    .replace('"isSignedOut":true', '"isSignedOut":false')
    .replace(/("subscriptionStateEntity":\{"key":"[^"]+","subscribed":)false/, `$1${subscribed}`),
)

describe('search for an artist', () => {
  it('parses the card with the patched classes rather than ones built at runtime', () => {
    const patched = YTNodes as unknown as Record<string, abstract new (...args: never[]) => unknown>
    const results = parse().results
    expect(results[0]).toBeInstanceOf(patched.OfficialCardView!)
    expect((results[0] as unknown as { contents: unknown[] }).contents[0]).toBeInstanceOf(patched.HorizontalShelfView!)
  })

  it('reads a card only off an OfficialCardView, not off another node of the same shape', () => {
    const card = parse().results[0]!
    expect(normalizeSearchCard(card)).toBeDefined()
    Object.assign(card, { type: 'UniversalWatchCard' })
    expect(normalizeSearchCard(card)).toBeUndefined()
  })

  it('opens on the artist card: the channel, its mix and its top videos', async () => {
    const results = await search()
    expect(results[0]?.kind).toBe('card')
    const card = cardOf(results)
    expect(card.channel).toMatchObject({
      id: 'UCuAXFkgsw1L7xaCfnd5JJOw',
      name: 'Rick Astley',
      handle: '@RickAstleyYT',
      subscriberCountText: '4.56M subscribers',
      videoCountText: '442 videos',
      description: 'Richard Paul Astley is an English singer, songwriter, radio DJ and podcaster.',
      isVerifiedArtist: true,
      avatar: expect.stringMatching(/^https:\/\/yt3\.ggpht\.com\//),
    })
    expect(card.mix).toEqual({
      id: 'RDEMt6MUSQI0t_Ts2EDUDWGRhQ',
      title: 'Mix - Rick Astley',
      thumbnail: expect.stringContaining('/vi/dQw4w9WgXcQ/'),
      videoId: 'dQw4w9WgXcQ',
    })
    expect(card.videos.map((video) => video.id)).toEqual(['dQw4w9WgXcQ', 'yPYZpwSpKmA', '3BFTio5296w'])
    expect(card.videos[0]).toMatchObject({
      title: 'Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)',
      viewCount: '1.8B',
      publishedText: '17y ago',
      durationSeconds: 214,
      channel: { id: 'UCuAXFkgsw1L7xaCfnd5JJOw', name: 'Rick Astley' },
    })
  })

  it('keeps the "Latest from" shelf and the Shorts shelves where upstream puts them', async () => {
    const results = await search()
    expect(results.map((result) => result.kind === 'shelf' ? result.title : result.kind)).toEqual([
      'card',
      'video',
      'Latest from Rick Astley',
      'Latest Shorts from Rick Astley',
      'video',
      'Shorts',
    ])
    const [latest, shorts] = results.filter((result) => result.kind === 'shelf')
    expect(latest).toMatchObject({ collapsedCount: 2, shorts: [] })
    expect(latest?.videos).toHaveLength(5)
    expect(latest?.videos[0]).toMatchObject({ id: 'PXC_PYeB6F8', channel: { id: 'UCuAXFkgsw1L7xaCfnd5JJOw' } })
    expect(shorts).toMatchObject({ videos: [] })
    expect(shorts?.shorts.map((short) => short.id)).toEqual(['YJbUv8BIZRY', '-cMznWcKK5Q', 'TIRgIY2nwOk'])
    expect(shorts?.shorts[0]).toMatchObject({ isShort: true, viewCount: '5.5K views' })
  })

  it('leaves the subscribe state absent signed out, where the button has to sign in', async () => {
    expect(cardOf(await search()).channel.isSubscribed).toBeUndefined()
  })

  it('reads the subscribe state off the entity store signed in', async () => {
    expect(cardOf(await search(signedIn(true))).channel.isSubscribed).toBe(true)
    expect(cardOf(await search(signedIn(false))).channel.isSubscribed).toBe(false)
  })
})
