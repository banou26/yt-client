import { outboundUrl } from '../sources/youtube/normalize'

/**
 * One element a creator placed over the last seconds of a video, read from the player answer's
 * `endscreen.endscreenRenderer`. `left` and `width` are fractions of the picture's width and `top` of its height, with
 * `aspectRatio` (width over height) giving the height; the element shows from `startMs` until `endMs` or the end.
 */
export type EndScreenElement = {
  kind: 'video' | 'playlist' | 'channel' | 'website'
  left: number
  top: number
  width: number
  aspectRatio: number
  startMs: number
  endMs: number
  title: string
  image?: string
  /** a video's length or a playlist's count, drawn over its image */
  badge?: string
  /** a channel's description or a website's domain, shown on hover */
  metadata?: string
  /** a website's link text, such as Support */
  action?: string
  videoId?: string
  playlistId?: string
  channelId?: string
  /** a website's destination rather than youtube.com's redirect page to it */
  url?: string
  /** a channel's, as the answer had it: false for every channel when signed out */
  subscribed?: boolean
}

type Text = { simpleText?: string, runs?: { text?: string }[] }

type ElementNode = {
  style?: string
  left?: number
  top?: number
  width?: number
  aspectRatio?: number
  startMs?: string
  endMs?: string
  title?: Text
  metadata?: Text
  callToAction?: Text
  playlistLength?: Text
  image?: { thumbnails?: { url?: string, width?: number }[] }
  thumbnailOverlays?: { thumbnailOverlayTimeStatusRenderer?: { text?: Text } }[]
  hovercardButton?: { subscribeButtonRenderer?: { subscribed?: boolean } }
  endpoint?: {
    watchEndpoint?: { videoId?: string, playlistId?: string }
    browseEndpoint?: { browseId?: string }
    urlEndpoint?: { url?: string }
  }
}

const KINDS = { VIDEO: 'video', PLAYLIST: 'playlist', CHANNEL: 'channel', WEBSITE: 'website' } as const

const text = (value: Text | undefined) =>
  (value?.simpleText ?? value?.runs?.map(run => run.text ?? '').join(''))?.trim() || undefined

const largest = (node: ElementNode) =>
  node.image?.thumbnails?.filter(item => item.url).sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url

const parseElement = (node: ElementNode): EndScreenElement | undefined => {
  const kind = KINDS[node.style as keyof typeof KINDS]
  const title = text(node.title)
  const startMs = Number(node.startMs)
  const endMs = Number(node.endMs)
  const { left, top, width, aspectRatio } = node
  if (!kind || !title || ![left, top, width, aspectRatio, startMs, endMs].every(Number.isFinite)) return undefined
  if (!(width! > 0 && aspectRatio! > 0 && endMs > startMs)) return undefined
  const watch = node.endpoint?.watchEndpoint
  const element: EndScreenElement = {
    kind,
    left: left!,
    top: top!,
    width: width!,
    aspectRatio: aspectRatio!,
    startMs,
    endMs,
    title,
    image: largest(node),
  }
  if (kind === 'video' && watch?.videoId) {
    return { ...element, videoId: watch.videoId, badge: text(node.thumbnailOverlays?.[0]?.thumbnailOverlayTimeStatusRenderer?.text) }
  }
  if (kind === 'playlist' && watch?.videoId && watch.playlistId) {
    return { ...element, videoId: watch.videoId, playlistId: watch.playlistId, badge: text(node.playlistLength) }
  }
  const channelId = node.endpoint?.browseEndpoint?.browseId
  if (kind === 'channel' && channelId) {
    return { ...element, channelId, metadata: text(node.metadata), subscribed: node.hovercardButton?.subscribeButtonRenderer?.subscribed }
  }
  const url = outboundUrl(node.endpoint?.urlEndpoint?.url)
  if (kind === 'website' && url) return { ...element, url, metadata: text(node.metadata), action: text(node.callToAction) }
  return undefined
}

/** The end screen's elements in a player answer, leaving out any it cannot place or open. */
export const parseEndScreen = (raw: unknown): EndScreenElement[] => {
  const elements = (raw as {
    endscreen?: { endscreenRenderer?: { elements?: { endscreenElementRenderer?: ElementNode }[] } }
  } | undefined)?.endscreen?.endscreenRenderer?.elements ?? []
  return elements.flatMap((item) => {
    const element = item.endscreenElementRenderer && parseElement(item.endscreenElementRenderer)
    return element ? [element] : []
  })
}
