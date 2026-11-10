import type { Exhaustive, SourceApi } from '../sources/types'
import type { TransportResponse } from '../scramjet/protocol'

import type { CaptionTrack } from './captions'
import type { EndScreenElement } from './end-screen'
import type { Storyboard } from './storyboard'

import { SOURCE_METHODS } from '../sources/types'

export type { CaptionTrack } from './captions'
export type { EndScreenElement } from './end-screen'
export type { Storyboard, StoryboardFrame } from './storyboard'

// the terminal marker the players match on, declared here because the app realm has to recognize it too
export const LIVE_UNSUPPORTED = 'youtube: live streams are not playable in this client yet'
/**
 * Leads the message every segment request of a playback fails with once its stream was refused twice in a row: the
 * session that replaced a refused one was refused too. Not a `PlaybackRefusal`: the watch page said the video plays.
 */
export const STREAM_REFUSED = 'youtube: stream refused'

/**
 * What youtube.com shows in place of the player when upstream refuses a video, in its own words: the title and the
 * line under it, the channel's avatar over the video's thumbnail for a members-only video, and whether it offers
 * Sign in, and at its large size as on the age gate. `final` marks a refusal that asking again cannot change, such as a deleted, members-only, age-restricted
 * or private video, which the players show at once rather than retrying.
 */
export type PlaybackRefusal = {
  title: string
  description?: string
  thumbnail?: string
  avatar?: string
  signIn?: boolean
  largeSignIn?: boolean
  final: boolean
}

/** Leads the message `openPlayback` rejects with when upstream refuses the video, followed by its `PlaybackRefusal` as JSON. */
export const PLAYBACK_REFUSED = 'youtube: refused: '

/** The refusal an `openPlayback` rejection carries, undefined for any other failure. */
export const playbackRefusal = (error: unknown): PlaybackRefusal | undefined => {
  if (!(error instanceof Error) || !error.message.startsWith(PLAYBACK_REFUSED)) return undefined
  try {
    return JSON.parse(error.message.slice(PLAYBACK_REFUSED.length)) as PlaybackRefusal
  } catch {
    return undefined
  }
}

export type PlaybackFormat = {
  key: string
  itag: number
  mimeType: string
  bitrate: number
  width?: number
  height?: number
  qualityLabel?: string
  audioTrackId?: string
  language?: string
  // optional rather than zero-filled: a `{0,0}` range is a REAL range meaning "one byte"
  initRange?: { start: number, end: number }
  indexRange?: { start: number, end: number }
  // live only: one segment's worth, and sequence maps onto time through it
  targetDurationMs?: number
}

// a format mimeType's codecs parameter, '' when it names none
export const codecsOf = (mimeType: string) => mimeType.match(/codecs="([^"]+)"/)?.[1] ?? ''

export type PlaybackSnapshot = {
  currentTimeMs: number
  playbackRate: number
  bandwidthEstimate: number
  viewportWidth: number
  viewportHeight: number
}

export type PlaybackSession = {
  id: string
  durationMs: number
  manifest: string
  videoFormats: PlaybackFormat[]
  audioFormats: PlaybackFormat[]
  selectedVideoKey: string
  selectedAudioKey: string
  storyboards: Storyboard[]
  // always empty for live: Shaka refuses a side-loaded text track when the presentation duration is infinite (CANNOT_ADD_EXTERNAL_TEXT_TO_LIVE_STREAM)
  captionTracks: CaptionTrack[]
  endScreen: EndScreenElement[]
  isLive: boolean
}

export type SegmentRequest = {
  requestId: string
  sessionId: string
  generation: number
  track: 'audio' | 'video'
  kind: 'init' | 'media'
  formatKey?: string
  range?: { start: number, end: number }
  startTimeMs: number
  // live only: the SABR sequence the manifest named, and the only address the session can resolve exactly; absent for VOD, which addresses by byte range
  sequenceNumber?: number
  snapshot: PlaybackSnapshot
}

type SegmentMetadata = {
  generation: number
  track: 'audio' | 'video'
  kind: 'init' | 'media'
  formatKey: string
  mimeType: string
  sequenceNumber?: number
  startMs?: number
  durationMs?: number
  elapsedMs: number
}

export type SegmentEnvelope = SegmentMetadata & ({
  end: true
  data?: never
} | {
  end?: false
  data: ArrayBuffer
})

export type FrameApi = SourceApi & {
  prefetchPlayback(videoId: string): Promise<void>
  /**
   * Opens a playback of the video; a card's hover preview, or a click on the card, passes its inline playback params
   * as `playerParams`.
   */
  openPlayback(videoId: string, maxHeight?: number, playerParams?: string): Promise<PlaybackSession>
  /** The end screen of the video's plain watch page, which the answer to a card's params leaves out. */
  endScreen(videoId: string): Promise<EndScreenElement[]>
  requestSegment(request: SegmentRequest): Promise<SegmentEnvelope>
  liveManifest(sessionId: string): Promise<string>
  captionCues(sessionId: string, trackId: string): Promise<string>
  cancelSegment(sessionId: string, requestId: string): Promise<void>
  selectVideoFormat(sessionId: string, formatKey: string): Promise<void>
  closePlayback(sessionId: string): Promise<void>
  resetIdentity(): Promise<void>
}

export const FRAME_METHODS = [
  ...SOURCE_METHODS,
  'prefetchPlayback',
  'openPlayback',
  'endScreen',
  'requestSegment',
  'liveManifest',
  'captionCues',
  'cancelSegment',
  'selectVideoFormat',
  'closePlayback',
  'resetIdentity',
] as const satisfies readonly (keyof FrameApi)[]

export type FrameMethod = (typeof FRAME_METHODS)[number]

export type FrameMethodsAreExhaustive = Exhaustive<Exclude<keyof FrameApi, FrameMethod>>

const frameMethods: ReadonlySet<string> = new Set(FRAME_METHODS)

export const isFrameMethod = (value: unknown): value is FrameMethod =>
  typeof value === 'string' && frameMethods.has(value)

export type FrameRequest = {
  [Method in keyof FrameApi]: {
    id: number
    method: Method
    args: Parameters<FrameApi[Method]>
  }
}[keyof FrameApi]

export type FrameResponse = {
  id: number
  result: unknown
  error?: never
} | {
  id: number
  result?: never
  error: string
}

export type FrameProgress = {
  id: number
  progress: string
}

export type FrameEgressRequest = {
  type: 'fetch'
  id: number
  url: string
  options: {
    method?: string
    headers?: Record<string, string>
    body?: ArrayBuffer | null
    redirect?: 'follow' | 'manual'
  }
} | {
  type: 'cancel'
  id: number
}

export type FrameEgressResponse = {
  id: number
  response: TransportResponse
  error?: never
} | {
  id: number
  response?: never
  error: string
}

/** The lane's state, published on the app's `<html>` as `data-yt-direct`: `on` once a direct call was answered, `off`
 * while every call takes the frame's own fetch (the step is off, or the frame is signed in), `skipped` for the window
 * after a direct call failed and the frame's own fetch answered it. */
export type DirectReport = 'on' | 'off' | 'skipped'

/** The frame to the app realm on the direct lane: a request for the app realm to send (`body` is absent for a GET), its cancel, or the lane's state. */
export type DirectRequest = {
  type: 'fetch'
  id: number
  url: string
  body?: string
} | {
  type: 'cancel'
  id: number
} | {
  type: 'report'
  value: DirectReport
}

/** The app realm's answer: YouTube's own, whatever its status, or a failure, `network` when the browser's fetch threw a TypeError. */
export type DirectResponse = {
  id: number
  response: { status: number, statusText: string, headers: [string, string][], body: ArrayBuffer }
  error?: never
} | {
  id: number
  response?: never
  error: string
  network: boolean
}

/**
 * The only requests the direct lane carries, with the one method each is sent with: InnerTube POSTs and caption GETs on
 * www.youtube.com, which both answer youtube.fkn.app's origin. Undefined for any other url.
 */
export const directMethod = (url: string): 'POST' | 'GET' | undefined => {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'www.youtube.com') return undefined
    if (parsed.pathname.startsWith('/youtubei/v1/')) return 'POST'
    if (parsed.pathname === '/api/timedtext') return 'GET'
  } catch {}
  return undefined
}

export const FRAME_CONNECT = 'yt-client-frame-connect'
export const FRAME_EGRESS_CONNECT = 'yt-client-frame-egress-connect'
// behind yt-client:step:y1 only: the frame's end of the app realm's bridge to the BotGuard agent (src/engine/agent-host.ts)
export const FRAME_AGENT_CONNECT = 'yt-client-frame-agent-connect'
// behind yt-client:step:direct only: the frame's end of the app realm's direct lane (src/scramjet/direct-lane.ts)
export const FRAME_DIRECT_CONNECT = 'yt-client-frame-direct-connect'
