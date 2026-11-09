import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import { Parser, YT } from 'youtubei.js'

import { channelFeedUrl, createPacer, isChannelId, parseChannelFeed, timeFromAgo } from '../../../../src/sources/youtube/channel-feed'
import { createYoutubeSource } from '../../../../src/sources/youtube'
import videosTab from '../../fixtures/channel-videos-blender.json'
import notFound from '../../fixtures/feed-404.html?raw'
import feed from '../../fixtures/uulf-computerphile.xml?raw'

/* uulf-computerphile.xml is Computerphile's UULF feed (long uploads only) as YouTube served it on 2026-11-01.
   feed-404.html is the feed server's answer to a feed it does not have, recorded on 2026-11-09; by public reports it
   gives this answer to every feed while it is down. channel-videos-blender.json is described in
   channel-videos.test.ts. */

const CHANNEL = 'UC9-y-6csu5WGm29I7JiwpnA'

const entry = (fields: string) => `<entry>${fields}</entry>`

describe('channel uploads feed', () => {
  it('reads every entry of a real feed', () => {
    const videos = parseChannelFeed(feed)
    expect(videos).toHaveLength(15)
    expect(videos[0]).toEqual({
      id: 'NDgS__J1U-M',
      title: 'The Private Key Mistake! (TLS Key set to "4") - Computerphile',
      thumbnail: 'https://i3.ytimg.com/vi/NDgS__J1U-M/hqdefault.jpg',
      viewCount: '173007',
      publishedAt: '2026-10-30T15:47:25.000Z',
      badges: [],
      channel: { id: CHANNEL, name: 'Computerphile' },
    })
    expect(new Set(videos.map(video => video.id)).size).toBe(15)
    expect(videos.every(video => video.channel?.id === CHANNEL && video.publishedAt && video.viewCount)).toBe(true)
  })

  it('decodes the entities upstream escapes in titles', () => {
    const titles = parseChannelFeed(feed).map(video => video.title)
    expect(titles).toContain('Multiplayer Gaming & Flight Simulation - Computerphile')
    expect(titles.some(title => title.includes('&amp;') || title.includes('&quot;'))).toBe(false)
    expect(parseChannelFeed(entry('<yt:videoId>abcdefghijk</yt:videoId><title>&lt;3 &#39;n&#x27; &#128512;</title>'))[0]?.title)
      .toBe('<3 \'n\' \u{1F600}')
  })

  it('drops an entry without a video id or a title, and keeps one without a date', () => {
    const videos = parseChannelFeed([
      entry('<title>No id</title>'),
      entry('<yt:videoId>abcdefghijk</yt:videoId>'),
      entry('<yt:videoId>not an id</yt:videoId><title>Bad id</title>'),
      entry('<yt:videoId>lmnopqrstuv</yt:videoId><title>Kept</title><published>soon</published>'),
    ].join(''))
    expect(videos).toEqual([{ id: 'lmnopqrstuv', title: 'Kept', badges: [], publishedAt: undefined, thumbnail: undefined, viewCount: undefined, channel: undefined }])
  })

  it('reads an empty feed as no videos', () => {
    expect(parseChannelFeed('<?xml version="1.0"?><feed><title>Videos</title></feed>')).toEqual([])
  })

  it('asks for the long uploads playlist, with a query string that changes every 10 minutes', () => {
    const at = Date.UTC(2026, 10, 1, 12, 0, 0)
    const url = new URL(channelFeedUrl(CHANNEL, at))
    expect(url.origin + url.pathname).toBe('https://www.youtube.com/feeds/videos.xml')
    expect(url.searchParams.get('playlist_id')).toBe('UULF9-y-6csu5WGm29I7JiwpnA')
    expect(channelFeedUrl(CHANNEL, at + 9 * 60_000)).toBe(channelFeedUrl(CHANNEL, at))
    expect(channelFeedUrl(CHANNEL, at + 10 * 60_000)).not.toBe(channelFeedUrl(CHANNEL, at))
  })

  it('dates a video from its relative time, in the short and the long wording', () => {
    const now = Date.UTC(2026, 10, 9, 12, 0, 0)
    const ago = (text: string) => timeFromAgo(text, now)
    expect(ago('6d ago')).toBe('2026-11-03T12:00:00.000Z')
    expect(ago('19h ago')).toBe('2026-11-08T17:00:00.000Z')
    expect(ago('5m ago')).toBe('2026-11-09T11:55:00.000Z')
    expect(ago('1mo ago')).toBe('2026-10-10T12:00:00.000Z')
    expect(ago('2w ago')).toBe('2026-10-26T12:00:00.000Z')
    expect(ago('1y ago')).toBe('2025-11-09T12:00:00.000Z')
    expect(ago('3 days ago')).toBe('2026-11-06T12:00:00.000Z')
    expect(ago('Streamed 2 months ago')).toBe('2026-09-10T12:00:00.000Z')
    expect(ago('30 seconds ago')).toBe('2026-11-09T11:59:30.000Z')
    expect(ago('Premieres in 2 days')).toBeUndefined()
    expect(timeFromAgo(undefined, now)).toBeUndefined()
  })

  it('tells a channel id from a handle or a playlist id', () => {
    expect(isChannelId(CHANNEL)).toBe(true)
    expect(isChannelId('@Computerphile')).toBe(false)
    expect(isChannelId('UULF9-y-6csu5WGm29I7JiwpnA')).toBe(false)
    expect(isChannelId(`${CHANNEL}x`)).toBe(false)
  })
})

describe('feed pacing', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts tasks at least 100 ms apart, in call order', async () => {
    vi.useFakeTimers()
    const pace = createPacer(100)
    const starts: [number, number][] = []
    const begin = Date.now()
    const runs = [0, 1, 2, 3].map(index => pace(async () => {
      starts.push([index, Date.now() - begin])
      return index
    }))
    expect(starts).toEqual([[0, 0]])
    await vi.advanceTimersByTimeAsync(99)
    expect(starts).toEqual([[0, 0]])
    await vi.advanceTimersByTimeAsync(1)
    expect(starts).toEqual([[0, 0], [1, 100]])
    await vi.advanceTimersByTimeAsync(200)
    expect(starts).toEqual([[0, 0], [1, 100], [2, 200], [3, 300]])
    await expect(Promise.all(runs)).resolves.toEqual([0, 1, 2, 3])
  })

  it('starts at once after a quiet spell', async () => {
    vi.useFakeTimers()
    const pace = createPacer(100)
    await pace(async () => {})
    await vi.advanceTimersByTimeAsync(500)
    let started = false
    void pace(async () => {
      started = true
    })
    expect(started).toBe(true)
  })
})

describe('channelUploads', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  const sourceWith = (fetch: (url: string) => Promise<Response>) => createYoutubeSource({
    fetch: fetch as typeof globalThis.fetch,
    createClient: () => new Promise(() => {}),
  })

  it('reads the feed through the source fetch', async () => {
    const urls: string[] = []
    const source = sourceWith(async (url) => {
      urls.push(url)
      return new Response(feed)
    })
    const videos = await source.channelUploads(CHANNEL)
    expect(videos).toHaveLength(15)
    expect(new URL(urls[0]!).searchParams.get('playlist_id')).toBe('UULF9-y-6csu5WGm29I7JiwpnA')
  })

  const BLENDER = 'UCSMOQeBJ2RAnuFungnQOxLg'

  const notFoundSource = (getChannel: () => Promise<unknown>) => createYoutubeSource({
    fetch: (async () => new Response(notFound, { status: 404, headers: { 'content-type': 'text/html; charset=UTF-8' } })) as typeof globalThis.fetch,
    createClient: async () => ({ getChannel }) as never,
  })

  it('reads the Videos tab when the feed server answers its 404 page, dated off its relative times', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.UTC(2026, 10, 9, 12, 0, 0))
    const source = notFoundSource(async () => new YT.Channel(undefined as never, Parser.parseResponse(videosTab as never), true))
    const videos = await source.channelUploads(BLENDER)
    expect(videos.map(({ id, viewCount, publishedAt }) => ({ id, viewCount, publishedAt }))).toEqual([
      { id: 'mHrHLqQj7Ts', viewCount: '17000', publishedAt: '2026-11-03T12:00:00.000Z' },
      { id: 'dVrELpmfcEQ', viewCount: '12000', publishedAt: '2026-10-26T12:00:00.000Z' },
      { id: 'sO_lhW8av3U', viewCount: '23000', publishedAt: '2026-10-19T12:00:00.000Z' },
      { id: 'cM3NJuY_xLc', viewCount: '10000', publishedAt: '2026-10-10T12:00:00.000Z' },
    ])
    expect(videos[0]?.title).toBe('Making of: The Blender Open Movies Exhibition')
  })

  it('reads no videos for a channel without a Videos tab', async () => {
    const source = notFoundSource(async () => ({ has_videos: false }))
    await expect(source.channelUploads(BLENDER)).resolves.toEqual([])
  })

  it('fails when the Videos tab cannot be read either', async () => {
    const source = notFoundSource(async () => { throw new Error('browse failed') })
    await expect(source.channelUploads(BLENDER)).rejects.toThrow('browse failed')
  })

  it('refuses an id that is not a channel id before any request', async () => {
    const urls: string[] = []
    const source = sourceWith(async (url) => {
      urls.push(url)
      return new Response(feed)
    })
    await expect(source.channelUploads('@Computerphile')).rejects.toThrow('not a channel id')
    expect(urls).toEqual([])
  })

  it('spaces the feeds of one source 100 ms apart', async () => {
    vi.useFakeTimers()
    const begin = Date.now()
    const starts: number[] = []
    const source = sourceWith(async () => {
      starts.push(Date.now() - begin)
      return new Response(feed)
    })
    const reads = [0, 1, 2].map(() => source.channelUploads(CHANNEL))
    await vi.advanceTimersByTimeAsync(250)
    expect(starts).toEqual([0, 100, 200])
    await Promise.all(reads)
  })

  it('spaces each browse of a failed feed\'s Videos tab 100 ms apart from every other request', async () => {
    vi.useFakeTimers()
    const begin = Date.now()
    const starts: [string, number][] = []
    const record = (what: string) => starts.push([what, Date.now() - begin])
    const source = createYoutubeSource({
      fetch: (async () => {
        record('feed')
        return new Response(notFound, { status: 404 })
      }) as typeof globalThis.fetch,
      createClient: async () => ({
        getChannel: async (id: string) => {
          record(`channel ${id}`)
          return {
            has_videos: true,
            getVideos: async () => {
              record(`videos ${id}`)
              return new YT.Channel(undefined as never, Parser.parseResponse(videosTab as never), true)
            },
          }
        },
      }) as never,
    })
    const reads = Promise.all([BLENDER, CHANNEL].map((id) => source.channelUploads(id)))
    await vi.runAllTimersAsync()
    await reads
    expect(starts).toEqual([
      ['feed', 0],
      ['feed', 100],
      [`channel ${BLENDER}`, 200],
      [`channel ${CHANNEL}`, 300],
      [`videos ${BLENDER}`, 400],
      [`videos ${CHANNEL}`, 500],
    ])
  })
})
