import type { FrameApi, FrameProgress, FrameRequest, FrameResponse, SegmentEnvelope } from './protocol'

import type { YoutubeClient } from '../sources/youtube'

import type { CaptionSource } from './captions'
import type { PlaybackEntry } from './playback'

import { createYoutubeSource } from '../sources/youtube'
import { json3ToWebVtt, parseCaptionTracks, timedTextUrl } from './captions'
import { parseEndScreen } from './end-screen'
import { catalogInnertube, hasSessionCookie, prefetchInitialPlayerResponse, youtubeFetch } from './innertube'
import { buildLiveManifest, liveAnchor, timelineEndMs } from './live-manifest'
import { openLiveManifest } from './live-open'
import { closePlaybackEntry, isCancellation, openPlaybackEntry, requestPlaybackSegment } from './playback'
import { resetIdentity } from './identity'
import { FRAME_CONNECT, isFrameMethod } from './protocol'

const { id: _sourceId, ...sourceApi } = createYoutubeSource({
  fetch: globalThis.fetch.bind(globalThis),
  createClient: () => catalogInnertube() as unknown as Promise<YoutubeClient>,
  signedIn: hasSessionCookie,
})

const sessions = new Map<string, PlaybackEntry>()
let sessionId = 0

const LIVE_REFRESH_WAIT_MS = 2_000

// watch-page caption addresses are marked `exp=xpe` and answer 200 with an empty body; ANDROID_VR's serve real json3
const CUE_CLIENT = 'ANDROID_VR'

const cueSourcesFor = async (entry: PlaybackEntry) => {
  entry.cueSources ??= (async () => {
    const client = await catalogInnertube()
    const info = await client.getBasicInfo(entry.videoId, { client: CUE_CLIENT })
    return parseCaptionTracks(info.captions)
  })().catch((error) => {
    entry.cueSources = undefined
    throw error
  })
  return entry.cueSources
}

const cueSourceFor = async (entry: PlaybackEntry, track: CaptionSource) => {
  const sources = await cueSourcesFor(entry)
  const match = sources.find((source) => source.id === track.id)
    ?? sources.find((source) => source.languageCode === track.languageCode && source.auto === track.auto)
    ?? sources.find((source) => source.languageCode === track.languageCode)
  if (!match) throw new Error(`youtube: caption track ${track.id} has no servable address`)
  return match
}

/* the anchor is carried on the entry rather than recomputed, so every refresh hangs off the same presentation zero, and
   so is the window's start: a refreshed session knows none until it is answered, and a narrower window drops the
   playhead of a viewer watching behind the edge to the window's new start */
const liveManifestFor = (entry: PlaybackEntry) => {
  const player = entry.player
  const segments = player.liveSegments
  const nowMs = Date.now()
  const endMs = timelineEndMs(segments)
  if (endMs === undefined) return undefined
  entry.liveAnchorMs = liveAnchor(entry.liveAnchorMs, nowMs, endMs)
  entry.liveWindowStartMs = player.liveWindowStartMs ?? entry.liveWindowStartMs
  return buildLiveManifest({
    videoFormats: player.videoFormats,
    audioFormats: player.audioFormats,
    targetMs: player.targetDurationMs,
    segments,
    nowMs,
    anchorMs: entry.liveAnchorMs,
    windowStartMs: entry.liveWindowStartMs,
  })
}

const api = {
  ...sourceApi,
  resetIdentity,
  prefetchPlayback: async (videoId) => {
    prefetchInitialPlayerResponse(videoId)
  },
  openPlayback: async (videoId, maxHeight, playerParams) => {
    const id = `playback:${++sessionId}`
    const { source, entry } = await openPlaybackEntry(videoId, maxHeight, playerParams)
    const player = entry.player
    const manifest = source.isLive
      ? await openLiveManifest(player, { sessionId: id, videoId, manifestFor: () => liveManifestFor(entry) })
      : player.manifest
    sessions.set(id, entry)
    return {
      id,
      durationMs: player.durationMs,
      manifest,
      videoFormats: player.videoFormats,
      audioFormats: player.audioFormats,
      selectedVideoKey: player.videoFormat.key,
      selectedAudioKey: player.audioFormat.key,
      storyboards: source.storyboards,
      captionTracks: entry.captions.map(({ url: _url, ...track }) => track),
      endScreen: source.endScreen,
      playerParams: source.playerParams,
      isLive: source.isLive,
    }
  },
  // the page an intent prefetch read for the click, which a card's playback neither uses nor drops
  endScreen: async (videoId) => parseEndScreen(await prefetchInitialPlayerResponse(videoId)),
  requestSegment: async (request, progress: (phase: string) => void = () => {}) => {
    const entry = sessions.get(request.sessionId)
    if (!entry) throw new Error(`youtube: unknown playback session ${request.sessionId}`)
    return requestPlaybackSegment(entry, request, progress)
  },
  liveManifest: async (id) => {
    const entry = sessions.get(id)
    if (!entry) throw new Error(`youtube: unknown playback session ${id}`)
    entry.player.startLivePump()
    const deadline = Date.now() + LIVE_REFRESH_WAIT_MS
    for (;;) {
      const manifest = liveManifestFor(entry)
      if (manifest) {
        entry.lastLiveManifest = manifest
        return manifest
      }
      if (Date.now() > deadline) break
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    if (entry.lastLiveManifest) return entry.lastLiveManifest
    throw new Error(`youtube: live session ${id} has no delivered segments`)
  },
  captionCues: async (id, trackId) => {
    const entry = sessions.get(id)
    if (!entry) throw new Error(`youtube: unknown playback session ${id}`)
    const track = entry.captions.find((candidate) => candidate.id === trackId)
    if (!track) throw new Error(`youtube: unknown caption track ${trackId}`)
    const source = await cueSourceFor(entry, track)
    // off the direct lane, the frame's own fetch rather than `egressFetch`: same-origin here, and an explicit cookie header would route this onto the tunnel
    const response = await youtubeFetch(timedTextUrl(source.url), { credentials: 'include' })
    if (!response.ok) throw new Error(`youtube: caption track ${trackId} answered ${response.status}`)
    const body = await response.text()
    if (!body) throw new Error(`youtube: caption track ${trackId} was answered with no cues`)
    return json3ToWebVtt(body)
  },
  cancelSegment: async (id, requestId) => {
    sessions.get(id)?.requests.get(requestId)?.abort()
  },
  selectVideoFormat: async (id, key) => {
    const entry = sessions.get(id)
    if (!entry) throw new Error(`youtube: unknown playback session ${id}`)
    const run = entry.chain.then(() => {
      if (entry.closed) throw new Error(`youtube: unknown playback session ${id}`)
      entry.player.selectVideoFormat(key)
    })
    entry.chain = run.catch(() => {})
    entry.serial = entry.chain
    await run
  },
  closePlayback: async (id) => {
    const entry = sessions.get(id)
    if (!entry) return
    closePlaybackEntry(entry)
    sessions.delete(id)
  },
} satisfies FrameApi

// a refused stream fails every later segment request of its playback with the same error, which is logged once
let lastLogged: unknown

const logFailure = (method: string, error: unknown) => {
  if (isCancellation(error) || error === lastLogged) return
  lastLogged = error
  console.error(`yt-client: ${method} failed`, error)
}

const dispatch = async (request: FrameRequest, progress: (phase: string) => void) => {
  // only requestSegment takes the progress callback: its RPC heartbeat is what keeps the app realm's inactivity deadline from firing mid-download
  if (request.method === 'requestSegment') return api.requestSegment(request.args[0], progress)
  if (!isFrameMethod(request.method)) throw new Error(`yt-client: unknown frame method ${String(request.method)}`)
  return (api[request.method] as (...args: unknown[]) => Promise<unknown>)(...request.args)
}

const connect = (port: MessagePort) => {
  port.addEventListener('message', (event) => {
    const request = event.data as FrameRequest
    document.documentElement.dataset.frameApi = request.method
    const progress = (phase: string) => {
      try {
        port.postMessage({ id: request.id, progress: phase } satisfies FrameProgress)
      } catch {}
    }
    void dispatch(request, progress).then(
      (result) => {
        document.documentElement.dataset.frameApi = `${request.method}:done`
        const segment = result as SegmentEnvelope
        const transferables = request.method === 'requestSegment' && !segment.end ? [segment.data] : []
        port.postMessage({ id: request.id, result } satisfies FrameResponse, transferables)
      },
      (error) => {
        document.documentElement.dataset.frameApi = `${request.method}:error`
        logFailure(request.method, error)
        port.postMessage({
          id: request.id,
          error: error instanceof Error ? error.message : String(error),
        } satisfies FrameResponse)
      },
    )
  })
  port.start()
}

Object.defineProperty(window, FRAME_CONNECT, {
  configurable: true,
  value: connect,
})
