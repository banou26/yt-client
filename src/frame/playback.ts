import type { CaptionSource } from './captions'
import type { SegmentEnvelope, SegmentRequest } from './protocol'

import { getSabrSource } from './innertube'
import { STREAM_REFUSED } from './protocol'
import { createSabrSession, isSabrSessionRefreshError } from './sabr'

type SabrSession = ReturnType<typeof createSabrSession>

export type PlaybackEntry = {
  videoId: string
  maxHeight?: number
  player: SabrSession
  chain: Promise<unknown>
  serial: Promise<unknown>
  requests: Map<string, AbortController>
  generation: number
  closed: boolean
  refreshing?: Promise<void>
  // the session the last refresh left current, until it delivers a segment
  recovered?: SabrSession
  refused?: Error
  captions: CaptionSource[]
  cueSources?: Promise<CaptionSource[]>

  lastLiveManifest?: string
  liveAnchorMs?: number
}

/** Reads the video's watch page and opens a SABR session on it. */
export const openPlaybackEntry = async (videoId: string, maxHeight?: number) => {
  const source = await getSabrSource(videoId)
  const entry: PlaybackEntry = {
    videoId,
    maxHeight,
    player: createSabrSession(source, maxHeight),
    chain: Promise.resolve(),
    serial: Promise.resolve(),
    requests: new Map(),
    generation: 0,
    closed: false,
    // Shaka rejects a side-loaded text track against an infinite presentation
    captions: source.isLive ? [] : source.captions,
  }
  return { source, entry }
}

/** Stops everything the entry has in flight, its refresh included, and closes its SABR session. */
export const closePlaybackEntry = (entry: PlaybackEntry) => {
  entry.closed = true
  for (const controller of entry.requests.values()) controller.abort()
  entry.requests.clear()
  entry.player.close()
}

const refreshSession = async (entry: PlaybackEntry) => {
  if (entry.closed) throw new Error('youtube: playback session closed during refresh')
  const previous = entry.player
  const videoKey = previous.videoFormat.key
  const videoMimeType = previous.videoFormat.mimeType
  const audioKey = previous.audioFormat.key
  const audioMimeType = previous.audioFormat.mimeType
  const source = await getSabrSource(entry.videoId)
  if (entry.closed) throw new Error('youtube: playback session closed during refresh')
  // a new live session asked at 0 is answered at the oldest end of the DVR window, so it continues where this one got to
  const next = createSabrSession(source, entry.maxHeight, source.isLive ? previous.liveEndMs : undefined)
  const videoFormat = next.videoFormats.find((format) => format.key === videoKey && format.mimeType === videoMimeType)
  const audioFormat = next.audioFormats.find((format) => format.key === audioKey && format.mimeType === audioMimeType)
  if (!videoFormat || !audioFormat) {
    next.close()
    throw new Error('youtube: playback formats changed during session refresh')
  }
  next.selectVideoFormat(videoFormat.key)
  next.selectAudioFormat(audioFormat.key)
  previous.close()
  entry.player = next
  if (!source.isLive) entry.captions = source.captions
  next.startLivePump()
}

/**
 * One segment of the entry's video. A session YouTube will not serve is replaced at once by a new one on a new watch
 * page read. If that one is not served either before it delivers a segment, the playback is refused: this request and
 * every later one fail with `STREAM_REFUSED` and read nothing more, and the player decides when to open the video
 * again. A refresh that itself fails counts the same, so a playback reads at most one more watch page per stretch of
 * delivered segments.
 */
export const requestPlaybackSegment = (
  entry: PlaybackEntry,
  request: SegmentRequest,
  progress: (phase: string) => void,
): Promise<SegmentEnvelope> => {
  const controller = new AbortController()
  entry.requests.set(request.requestId, controller)
  entry.generation = Math.max(entry.generation, request.generation)
  document.documentElement.dataset.segmentStartMs = String(request.startTimeMs)
  const assertActive = () => {
    if (controller.signal.aborted || request.generation < entry.generation) {
      throw new Error('youtube: segment request cancelled')
    }
    if (entry.closed) throw new Error(`youtube: unknown playback session ${request.sessionId}`)
  }
  const attempt = async (): Promise<SegmentEnvelope> => {
    assertActive()
    if (entry.refused) throw entry.refused
    const player = entry.player
    try {
      const segment = await player.requestSegment(request, progress, controller.signal)
      assertActive()
      entry.recovered = undefined
      return segment
    } catch (error) {
      assertActive()
      if (!isSabrSessionRefreshError(error)) throw error
      if (player === entry.recovered) {
        entry.refused ??= new Error(`${STREAM_REFUSED} (${error.message.replace(/^youtube: /, '')})`)
        throw entry.refused
      }
      document.documentElement.dataset.segmentRecovery = error.message
      progress('session-refresh')
      // refresh only if the player that failed is still current, or a stale failure disposes a fresh session
      if (entry.player === player) {
        await (entry.refreshing ??= refreshSession(entry).finally(() => {
          entry.refreshing = undefined
          entry.recovered = entry.player
        }))
      }
      return attempt()
    }
  }
  const base = request.kind === 'init' ? entry.serial : entry.chain
  const run = base.then(attempt).finally(() => entry.requests.delete(request.requestId))
  if (request.kind === 'init') {
    entry.chain = Promise.allSettled([entry.chain, run]).then(() => {})
  } else {
    entry.chain = run.catch(() => {})
    entry.serial = entry.chain
  }
  return run
}
