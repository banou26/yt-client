import type { SourceVideo } from '../types'

const CHANNEL_ID = /^UC[\w-]{22}$/

/** Whether `id` is a channel id of the `UC` form, the only form a channel's uploads feed can be built from. */
export const isChannelId = (id: string) => CHANNEL_ID.test(id)

// the relay keeps an answer for an hour on its whole request, so the query string changes every 10 minutes to get a newer one
const FRESH_WINDOW_MS = 10 * 60_000

/**
 * A channel's public feed of long uploads: its `UULF` playlist, so no Shorts and no live streams, and at most
 * the 15 newest. The plain `channel_id` feed mixes Shorts into those 15 and leaves some channels with few videos.
 */
export const channelFeedUrl = (channelId: string, now: number) => {
  const params = new URLSearchParams({
    playlist_id: `UULF${channelId.slice(2)}`,
    window: String(Math.floor(now / FRESH_WINDOW_MS)),
  })
  return `https://www.youtube.com/feeds/videos.xml?${params}`
}

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'' }

const decode = (value: string) =>
  value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (!entity.startsWith('#')) return NAMED_ENTITIES[entity] ?? match
    const code = entity[1] === 'x' || entity[1] === 'X'
      ? Number.parseInt(entity.slice(2), 16)
      : Number.parseInt(entity.slice(1), 10)
    return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match
  })

const element = (xml: string, name: string) => {
  const value = new RegExp(`<${name}>([^<]*)</${name}>`).exec(xml)?.[1]
  return value === undefined ? undefined : decode(value).trim()
}

const attribute = (xml: string, name: string, key: string) => {
  const value = new RegExp(`<${name}\\s[^>]*\\b${key}="([^"]*)"`).exec(xml)?.[1]
  return value === undefined ? undefined : decode(value)
}

const parseEntry = (entry: string): SourceVideo | undefined => {
  const id = element(entry, 'yt:videoId')
  const title = element(entry, 'title')
  if (!id || !/^[\w-]{11}$/.test(id) || !title) return undefined
  const published = Date.parse(element(entry, 'published') ?? '')
  const views = attribute(entry, 'media:statistics', 'views')
  const channelId = element(entry, 'yt:channelId')
  const channelName = element(entry, 'name')
  return {
    id,
    title,
    thumbnail: attribute(entry, 'media:thumbnail', 'url'),
    viewCount: views && /^\d+$/.test(views) ? views : undefined,
    publishedAt: Number.isNaN(published) ? undefined : new Date(published).toISOString(),
    badges: [],
    channel: channelId && channelName ? { id: channelId, name: channelName } : undefined,
  }
}

/** The videos of a channel feed, in feed order. An entry without a video id or a title is dropped. */
export const parseChannelFeed = (xml: string): SourceVideo[] =>
  [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)]
    .map(([, entry]) => parseEntry(entry ?? ''))
    .filter((video) => video !== undefined)

/** Runs tasks with their starts spaced at least `intervalMs` apart, in the order they were handed in. */
export const createPacer = (intervalMs: number) => {
  let nextStart = 0
  return <Result>(task: () => Promise<Result>): Promise<Result> => {
    const now = Date.now()
    const start = Math.max(now, nextStart)
    nextStart = start + intervalMs
    if (start === now) return task()
    return new Promise<void>((resolve) => { setTimeout(resolve, start - now) }).then(task)
  }
}
