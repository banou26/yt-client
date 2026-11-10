import { outboundUrl } from '../sources/youtube/normalize'

type Placement = {
  left: number
  top: number
  width: number
  aspectRatio: number
  startMs: number
  endMs: number
  title: string
  image?: string
}

/**
 * One element a creator placed over the last seconds of a video, read from the player answer's
 * `endscreen.endscreenRenderer`. `left` and `width` are fractions of the picture's width and `top` of its height, with
 * `aspectRatio` (width over height) giving the height; the element shows from `startMs` until `endMs` or the end.
 * `badge` is a video's length or a playlist's count, drawn over its image; `metadata` is a channel's description or a
 * website's domain, shown on hover; `subscribed` is as the answer had it, false for every channel when signed out.
 */
export type EndScreenElement = Placement & (
  | { kind: 'video', videoId: string, badge?: string }
  | { kind: 'playlist', videoId: string, playlistId: string, badge?: string }
  | { kind: 'channel', channelId: string, metadata?: string, subscribed?: boolean }
  // `url` is the destination rather than youtube.com's redirect page to it, and `action` its link text, such as Support
  | { kind: 'website', url: string, metadata?: string, action?: string }
)

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

const text = (value: Text | undefined) =>
  (value?.simpleText ?? value?.runs?.map(run => run.text ?? '').join(''))?.trim() || undefined

const largest = (node: ElementNode) =>
  node.image?.thumbnails?.filter(item => item.url).sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url

const parseElement = (node: ElementNode): EndScreenElement | undefined => {
  const title = text(node.title)
  const startMs = Number(node.startMs)
  const endMs = Number(node.endMs)
  const { left, top, width, aspectRatio } = node
  if (!title || ![left, top, width, aspectRatio, startMs, endMs].every(Number.isFinite)) return undefined
  if (!(width! > 0 && aspectRatio! > 0 && endMs > startMs)) return undefined
  const placement: Placement = { left: left!, top: top!, width: width!, aspectRatio: aspectRatio!, startMs, endMs, title, image: largest(node) }
  const { watchEndpoint: watch, browseEndpoint: browse, urlEndpoint: link } = node.endpoint ?? {}
  if (node.style === 'VIDEO' && watch?.videoId) {
    return { ...placement, kind: 'video', videoId: watch.videoId, badge: text(node.thumbnailOverlays?.[0]?.thumbnailOverlayTimeStatusRenderer?.text) }
  }
  if (node.style === 'PLAYLIST' && watch?.videoId && watch.playlistId) {
    return { ...placement, kind: 'playlist', videoId: watch.videoId, playlistId: watch.playlistId, badge: text(node.playlistLength) }
  }
  if (node.style === 'CHANNEL' && browse?.browseId) {
    return { ...placement, kind: 'channel', channelId: browse.browseId, metadata: text(node.metadata), subscribed: node.hovercardButton?.subscribeButtonRenderer?.subscribed }
  }
  const url = node.style === 'WEBSITE' ? outboundUrl(link?.url) : undefined
  return url ? { ...placement, kind: 'website', url, metadata: text(node.metadata), action: text(node.callToAction) } : undefined
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
