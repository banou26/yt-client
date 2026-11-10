import type {
  PlayerHttpRequest,
  PlayerHttpResponse,
  RequestFilter,
  ResponseFilter,
  SabrPlayerAdapter,
  SabrRequestMetadata,
} from 'googlevideo/sabr-streaming-adapter'
import type { SabrFormat } from 'googlevideo/shared-types'
import type { CacheManager, RequestMetadataManager } from 'googlevideo/utils'
import type { PlaybackFormat, PlaybackSnapshot, SegmentEnvelope, SegmentRequest } from './protocol'
import type { SabrSource } from './innertube'

import { BinaryReader, BinaryWriter, WireType } from '@bufbuild/protobuf/wire'
import { SabrStreamingAdapter, SabrUmpProcessor } from 'googlevideo/sabr-streaming-adapter'
import { LiveMetadata, MediaHeader, UMPPartId, VideoPlaybackAbrRequest } from 'googlevideo/protos'
import { FormatKeyUtils } from 'googlevideo/utils'
import { GVS_ORIGIN_KEY } from './innertube'
import { egressFetch } from './egress'
import { LIVE_HEAD_MS } from './live-open'

type AdapterState = {
  snapshot: PlaybackSnapshot
  audio?: SabrFormat
  video?: SabrFormat
  requestFilter?: RequestFilter
  responseFilter?: ResponseFilter
  metadata?: RequestMetadataManager
  cache?: CacheManager | null
}

type ExecutedResponse = PlayerHttpResponse & {
  metadata: SabrRequestMetadata
  elapsedMs: number
  endOfTrack: boolean
  partial: boolean
  partTypes: number[]
  incomplete?: { actual: number, expected: number }
}

const MAX_SEGMENT_ATTEMPTS = 3
const MAX_HARVESTED_SEGMENT_BYTES = 32 * 1024 * 1024
const MAX_MEDIA_CACHE_BYTES = 64 * 1024 * 1024
const START_TIME_TOLERANCE_MS = 2
const REFRESH_ERROR = 'SabrSessionRefreshError'
// under Shaka's own 30s segment timeout, so a wait turns into a retry we control
const LIVE_SEGMENT_WAIT_MS = 20_000
// Segments kept in the advertised timeline, which is also the rewind window.
const LIVE_TIMELINE_LIMIT = 48
// a live session keeps answers from this many segments behind the server's head on, and its pump starts there when the opening answer brought no segment
const LIVE_START_SEGMENTS = 3
const LIVE_REFUSALS = 2

const bytes = (value: ArrayBuffer | ArrayBufferView | null | undefined) => {
  if (!value) return undefined
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
}

const headers = (input: Headers) => Object.fromEntries(input.entries())

const wait = (durationMs: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) return reject(signal.reason)
  const complete = () => {
    signal?.removeEventListener('abort', aborted)
    resolve()
  }
  const timer = setTimeout(complete, durationMs)
  const aborted = () => {
    clearTimeout(timer)
    signal?.removeEventListener('abort', aborted)
    reject(signal?.reason)
  }
  signal?.addEventListener('abort', aborted, { once: true })
})

const refreshError = (message: string) => Object.assign(new Error(message), { name: REFRESH_ERROR })

export const isSabrSessionRefreshError = (error: unknown): error is Error =>
  error instanceof Error && error.name === REFRESH_ERROR

type UmpVarInt = { value: number, offset: number }

const readUmpVarInt = (data: Uint8Array, offset: number): UmpVarInt | undefined => {
  if (offset >= data.byteLength) return undefined
  const first = data[offset]!
  const length = first < 128 ? 1 : first < 192 ? 2 : first < 224 ? 3 : first < 240 ? 4 : 5
  if (offset + length > data.byteLength) return undefined
  if (length === 1) return { value: first, offset: offset + 1 }
  if (length === 2) return { value: (first & 0x3f) + 64 * data[offset + 1]!, offset: offset + 2 }
  if (length === 3) {
    return {
      value: (first & 0x1f) + 32 * (data[offset + 1]! + 256 * data[offset + 2]!),
      offset: offset + 3,
    }
  }
  if (length === 4) {
    return {
      value: (first & 0x0f) + 16 * (data[offset + 1]! + 256 * (data[offset + 2]! + 256 * data[offset + 3]!)),
      offset: offset + 4,
    }
  }
  return {
    value: new DataView(data.buffer, data.byteOffset + offset + 1, 4).getUint32(0, true),
    offset: offset + 5,
  }
}

export const createUmpFramer = () => {
  let pending = new Uint8Array()
  return {
    push(chunk: Uint8Array) {
      const data = pending.byteLength
        ? (() => {
            const joined = new Uint8Array(pending.byteLength + chunk.byteLength)
            joined.set(pending)
            joined.set(chunk, pending.byteLength)
            return joined
          })()
        : chunk
      const frames: { type: number, data: Uint8Array, payload: Uint8Array }[] = []
      let offset = 0
      while (offset < data.byteLength) {
        const start = offset
        const type = readUmpVarInt(data, offset)
        if (!type) break
        const size = readUmpVarInt(data, type.offset)
        if (!size || size.offset + size.value > data.byteLength) break
        const end = size.offset + size.value
        const encoded = data.slice(start, end)
        frames.push({
          type: type.value,
          data: encoded,
          payload: encoded.subarray(size.offset - start),
        })
        offset = end
      }
      pending = data.slice(offset)
      return frames
    },
    get partial() { return pending.byteLength > 0 },
  }
}

type UmpFrame = ReturnType<ReturnType<typeof createUmpFramer>['push']>[number]
type CollectedUmpSegment = {
  formatKey: string
  header: ReturnType<typeof MediaHeader.decode>
  data: Uint8Array
}

export const createUmpSegmentCollector = () => {
  const pending = new Map<number, {
    header: ReturnType<typeof MediaHeader.decode>
    chunks: Uint8Array[]
    size: number
  }>()
  return {
    push(frame: UmpFrame): CollectedUmpSegment | undefined {
      if (frame.type === UMPPartId.MEDIA_HEADER) {
        const header = MediaHeader.decode(frame.payload)
        pending.set(header.headerId ?? 0, { header, chunks: [], size: 0 })
        return
      }
      if (frame.type !== UMPPartId.MEDIA && frame.type !== UMPPartId.MEDIA_END) return
      const headerId = frame.payload[0]
      if (headerId === undefined) return
      const segment = pending.get(headerId)
      if (!segment) return
      if (frame.type === UMPPartId.MEDIA) {
        const chunk = frame.payload.subarray(1)
        segment.size += chunk.byteLength
        if (segment.size > MAX_HARVESTED_SEGMENT_BYTES) pending.delete(headerId)
        else segment.chunks.push(Uint8Array.from(chunk))
        return
      }
      pending.delete(headerId)
      const expected = Number(segment.header.contentLength ?? 0)
      if (expected > 0 && segment.size !== expected) return
      const data = new Uint8Array(segment.size)
      let offset = 0
      for (const chunk of segment.chunks) {
        data.set(chunk, offset)
        offset += chunk.byteLength
      }
      return {
        formatKey: FormatKeyUtils.fromMediaHeader(segment.header),
        header: segment.header,
        data,
      }
    },
    clear: () => pending.clear(),
  }
}

export const inspectUmpChunks = (chunks: Uint8Array[]) => {
  const framer = createUmpFramer()
  const partTypes: number[] = []
  for (const chunk of chunks) {
    for (const frame of framer.push(chunk)) partTypes.push(frame.type)
  }
  return {
    endOfTrack: partTypes.includes(UMPPartId.END_OF_TRACK),
    partial: framer.partial,
    partTypes,
  }
}

// UMP part 69, which googlevideo 4.0.4 does not name
const CUEPOINT_LIST = 69

type Cuepoint = { id: string, startMs: number, durationMs: number }

// read as googlevideo 5's SabrStream reads a CuepointList: each CuepointInfo (1) holds a cuepoint (1) and a timeRange (4)
const readCuepoints = (payload: Uint8Array) => {
  const cuepoints: Cuepoint[] = []
  const list = new BinaryReader(payload)
  while (list.pos < list.len) {
    const [field, wireType] = list.tag()
    if (field !== 1) {
      list.skip(wireType)
      continue
    }
    const info = new BinaryReader(list.bytes())
    let id = '', durationSec = 0, playheadSec = 0, startTicks = 0, timescale = 1_000
    while (info.pos < info.len) {
      const [infoField, infoType] = info.tag()
      if (infoField !== 1 && infoField !== 4) {
        info.skip(infoType)
        continue
      }
      const inner = new BinaryReader(info.bytes())
      while (inner.pos < inner.len) {
        const [innerField, innerType] = inner.tag()
        if (infoField === 1 && innerField === 3) durationSec = inner.double()
        else if (infoField === 1 && innerField === 4) playheadSec = inner.double()
        else if (infoField === 1 && innerField === 6) id = inner.string()
        else if (infoField === 4 && innerField === 1) startTicks = Number(inner.int64())
        else if (infoField === 4 && innerField === 3) timescale = inner.int32()
        else inner.skip(innerType)
      }
    }
    const startMs = Math.floor((startTicks / timescale - playheadSec) * 1_000)
    const durationMs = Math.round(durationSec * 1_000)
    // a time that is not finite would make every later request fail to encode, for the rest of the session
    if (id && Number.isFinite(startMs) && Number.isFinite(durationMs)) cuepoints.push({ id, startMs, durationMs })
  }
  return cuepoints
}

/* VideoPlaybackAbrRequest's ssapPlaybackInfos (24), which googlevideo 4.0.4 does not encode: cuepointId 7, state 8 (11,
   RATECONTROL_CLIENT, what youtube.com sends with no ad played), startTimeMs 10, durationMs 11 */
const encodeSsapPlaybackInfos = (cuepoints: Iterable<Cuepoint>) => {
  const writer = new BinaryWriter()
  for (const { id, startMs, durationMs } of cuepoints) {
    writer.tag(24, WireType.LengthDelimited).fork()
      .tag(7, WireType.LengthDelimited).string(id)
      .tag(8, WireType.Varint).int32(11)
      .tag(10, WireType.Varint).int64(startMs)
      .tag(11, WireType.Varint).int64(durationMs)
      .join()
  }
  return writer.finish()
}

const describeNoMedia = (response: ExecutedResponse) => {
  const sabrError = response.metadata.error?.sabrError
  if (sabrError) return `SABR error ${sabrError.type ?? 'unknown'}:${sabrError.code ?? 'unknown'}`
  const streamStatus = response.metadata.streamInfo?.streamProtectionStatus?.status
  if (streamStatus !== undefined) return `SABR stream status ${streamStatus}`
  if (response.metadata.streamInfo?.reloadPlaybackContext) return 'SABR player reload requested'
  if (response.partial) return 'truncated UMP response'
  const parts = response.partTypes.map((type) => UMPPartId[type] ?? String(type)).join(', ')
  return parts ? `UMP response contained ${parts}` : 'UMP response contained no parts'
}

const createPlayerAdapter = (state: AdapterState): SabrPlayerAdapter => ({
  initialize: (_player, metadata, cache) => {
    state.metadata = metadata
    state.cache = cache
  },
  getPlayerTime: () => state.snapshot.currentTimeMs / 1_000,
  getPlaybackRate: () => state.snapshot.playbackRate,
  getBandwidthEstimate: () => state.snapshot.bandwidthEstimate,
  getActiveTrackFormats: () => ({ audioFormat: state.audio, videoFormat: state.video }),
  registerRequestInterceptor: (interceptor) => {
    state.requestFilter = interceptor
  },
  registerResponseInterceptor: (interceptor) => {
    state.responseFilter = interceptor
  },
  dispose: () => {},
})

// rangeless (live) only: a VOD range answer ends with a sidx that cutting at moov would drop
const initSegmentPrefix = (data: Uint8Array) => {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  let offset = 0
  while (offset + 8 <= view.byteLength) {
    const size = view.getUint32(offset)
    if (size < 8) break
    const type = String.fromCharCode(
      view.getUint8(offset + 4),
      view.getUint8(offset + 5),
      view.getUint8(offset + 6),
      view.getUint8(offset + 7),
    )
    offset += size
    if (type === 'moov') return data.subarray(0, Math.min(offset, data.byteLength))
  }
  return data
}

/**
 * One SABR playback session over a source.
 *
 * `liveFromMs` is where a live session starts asking: a refreshed session passes the previous session's timeline end so
 * it continues there. Without it, the first answer's LIVE_METADATA decides the start, a few segments behind the head.
 */
export const createSabrSession = (source: SabrSource, maxHeight = 1_080, liveFromMs?: number) => {
  const videoFormats = source.playbackFormats.filter((format) => format.width && format.height)
  const audioFormats = source.playbackFormats.filter((format) => !format.width)
  const initialVideoFormat = videoFormats
    .filter((format) => format.height! <= maxHeight && MediaSource.isTypeSupported(format.mimeType))
    .sort((a, b) => b.height! - a.height!)[0]
    ?? videoFormats.find((format) => MediaSource.isTypeSupported(format.mimeType))
  const initialAudioFormat = audioFormats
    .filter((format) => MediaSource.isTypeSupported(format.mimeType))
    .sort((a, b) => Number(b.mimeType.includes('opus')) - Number(a.mimeType.includes('opus')))[0]
  if (!initialVideoFormat || !initialAudioFormat) throw new Error('youtube: no supported audio and video formats')
  let videoFormat: PlaybackFormat = initialVideoFormat
  let audioFormat: PlaybackFormat = initialAudioFormat
  // Every live stream measured used 5s segments
  const targetDurationMs = initialVideoFormat.targetDurationMs ?? initialAudioFormat.targetDurationMs ?? 5_000
  /* a live segment is asked for at its middle, never its start: the server can answer a start with the segment that
     ENDS there (measured 2026-11-09 on rFZHOHl-L8A, in 10 of 12 sessions), so a pump holding that segment's video was
     sent its audio again and fell behind the head at one segment per three answers */
  const insideLiveSegment = (startMs: number) => startMs + targetDurationMs / 2

  const byKey = new Map(source.formats.map((format) => [FormatKeyUtils.fromFormat(format), format]))
  const playbackByKey = new Map(source.playbackFormats.map((format) => [format.key, format]))
  const state: AdapterState = {
    snapshot: {
      currentTimeMs: 0,
      playbackRate: 1,
      bandwidthEstimate: 10_000_000,
      viewportWidth: 1_280,
      viewportHeight: 720,
    },
    audio: byKey.get(audioFormat.key),
    video: byKey.get(videoFormat.key),
  }
  const adapter = new SabrStreamingAdapter({
    clientInfo: source.clientInfo as never,
    playerAdapter: createPlayerAdapter(state),
  })
  adapter.setStreamingURL(source.streamingUrl)
  adapter.setUstreamerConfig(source.ustreamerConfig)
  adapter.setServerAbrFormats(source.formats)
  adapter.onMintPoToken(source.mint)
  adapter.attach(null)

  /* Status 3 asks for a new BotGuard session. About 1 session in 10 (9 of 95, 2026-11-05) is answered status 2 on an
     enforced video and keeps it through every retry, and a new one cleared it on the same stream 5 of 5 times. So a
     status 2 on a segment it could not use replaces the session too, once per stream so it cannot loop. */
  let replacedOnStatus2 = false
  const recoverFor = (streamStatus: number | undefined) => {
    if (streamStatus === 3) return source.recoverMint()
    if (streamStatus !== 2 || replacedOnStatus2) return
    replacedOnStatus2 = true
    return source.recoverMint()
  }

  type CachedMedia = CollectedUmpSegment & {
    cacheKey: string
    durationMs?: number
    sequenceNumber?: number
    startMs: number
    track: 'audio' | 'video'
  }
  type ActiveHarvest = {
    done: Promise<void>
    formatKeys: Set<string>
    generation: number
    reader: ReadableStreamDefaultReader<Uint8Array>
  }
  const mediaCache = new Map<string, CachedMedia>()
  let mediaCacheBytes = 0
  // only delivered segments are advertised; the server answers a live request at its address clamped into its DVR window (12 h deep on a 24/7 stream, measured 2026-11-06), so an answer to media time 0 is the window's OLDEST segment
  const liveTimeline = new Map<number, { sequenceNumber: number, startMs: number, durationMs: number }>()
  // LIVE_METADATA's head: the start of the newest segment the server has
  let liveHeadMs: number | undefined
  let liveStartMs = liveFromMs
  const noteLiveHead = (payload: Uint8Array) => {
    const headMs = Number(LiveMetadata.decode(payload).headTimeMs)
    if (!Number.isFinite(headMs) || headMs <= 0) return
    liveHeadMs = Math.max(liveHeadMs ?? headMs, headMs)
    liveStartMs ??= headMs - LIVE_START_SEGMENTS * targetDurationMs
  }
  /* before the start, only an answer near its address is kept: an answer to media time 0, the window's oldest segment,
     is not. Near, not at: an address on a segment's start was measured answered with the segment before it (2026-11-06). */
  const keepsLiveMedia = (startMs: number, askedMs: number) => liveStartMs !== undefined
    && (startMs >= liveStartMs || Math.abs(startMs - askedMs) <= LIVE_START_SEGMENTS * targetDurationMs)
  const liveEndMs = () => [...liveTimeline.values()]
    .reduce((end, segment) => Math.max(end, segment.startMs + segment.durationMs), liveStartMs ?? 0)
  /* an ad cuepoint is announced (CUEPOINT_LIST) on a "backoff, no media" answer at its segment, which stays refused until
     a request names the cuepoint. youtube.com names it in every request until its buffer passes the cuepoint's end.
     Measured 2026-11-10 on rFZHOHl-L8A, a 60 s cuepoint every 36 segments: asked again naming it, 11 of 11 were served,
     6 of them after the server's 5 s backoff; another video format, youtube.com's top-level fields or its ClientAbrState
     fields were refused 2 of 2 each, and without the name 6 of 6 were refused for good. */
  const cuepoints = new Map<string, Cuepoint>()
  const noteCuepoints = (payload: Uint8Array) => {
    for (const cuepoint of readCuepoints(payload)) {
      if (!cuepoints.has(cuepoint.id)) cuepoints.set(cuepoint.id, cuepoint)
    }
  }
  const announcedCuepoints = () => {
    for (const [id, { startMs, durationMs }] of cuepoints) {
      if (startMs + durationMs <= liveEndMs()) cuepoints.delete(id)
    }
    return cuepoints.values()
  }
  const recordLiveSegment = (segment: CachedMedia, targetMs: number) => {
    const { sequenceNumber, startMs, track } = segment
    if (sequenceNumber === undefined) return
    if (track === 'audio' && liveTimeline.has(sequenceNumber)) return
    liveTimeline.set(sequenceNumber, {
      sequenceNumber,
      startMs,
      durationMs: segment.durationMs && segment.durationMs > 0 ? segment.durationMs : targetMs,
    })
    while (liveTimeline.size > LIVE_TIMELINE_LIMIT) {
      const oldest = liveTimeline.keys().next().value
      if (oldest === undefined) break
      liveTimeline.delete(oldest)
    }
  }
  let resolveCacheChange: () => void = () => {}
  let cacheChange = new Promise<void>((resolve) => {
    resolveCacheChange = resolve
  })
  let activeHarvest: ActiveHarvest | undefined

  const notifyCacheChange = () => {
    const resolve = resolveCacheChange
    cacheChange = new Promise<void>((nextResolve) => {
      resolveCacheChange = nextResolve
    })
    resolve()
  }

  const storeCollectedSegment = (segment: CollectedUmpSegment, askedMs: number) => {
    const sabrFormat = byKey.get(segment.formatKey)
    if (!sabrFormat) return
    if (segment.header.isInitSeg) {
      const cacheKey = FormatKeyUtils.createSegmentCacheKey(segment.header, sabrFormat)
      const existing = bytes(state.cache?.getInitSegment(cacheKey))
      if (!existing || existing.byteLength < segment.data.byteLength) {
        state.cache?.setInitSegment(cacheKey, segment.data)
      }
      notifyCacheChange()
      return
    }
    const format = playbackByKey.get(segment.formatKey)
    const startMs = Number(segment.header.startMs)
    if (!format || !Number.isFinite(startMs)) return
    if (source.isLive && !keepsLiveMedia(startMs, askedMs)) return
    const cacheKey = `${segment.formatKey}:${startMs}:${segment.header.sequenceNumber ?? ''}`
    if (mediaCache.has(cacheKey)) return
    const cached: CachedMedia = {
      ...segment,
      cacheKey,
      durationMs: segment.header.durationMs === undefined ? undefined : Number(segment.header.durationMs),
      sequenceNumber: segment.header.sequenceNumber,
      startMs,
      track: format.width ? 'video' : 'audio',
    }
    mediaCache.set(cacheKey, cached)
    if (source.isLive) recordLiveSegment(cached, targetDurationMs)
    mediaCacheBytes += segment.data.byteLength
    while (mediaCacheBytes > MAX_MEDIA_CACHE_BYTES) {
      const oldest = mediaCache.entries().next().value as [string, CachedMedia] | undefined
      if (!oldest) break
      mediaCache.delete(oldest[0])
      mediaCacheBytes -= oldest[1].data.byteLength
    }
    notifyCacheChange()
  }

  const findCachedSequence = (track: 'audio' | 'video', formatKey: string, sequenceNumber: number) => {
    for (const segment of mediaCache.values()) {
      if (segment.track !== track || segment.formatKey !== formatKey) continue
      if (segment.sequenceNumber === sequenceNumber) return segment
    }
  }

  const cachedSequenceRange = (track: 'audio' | 'video', formatKey: string) => {
    let oldest: number | undefined
    let newest: number | undefined
    for (const segment of mediaCache.values()) {
      if (segment.track !== track || segment.formatKey !== formatKey) continue
      const sequence = segment.sequenceNumber
      if (sequence === undefined) continue
      if (oldest === undefined || sequence < oldest) oldest = sequence
      if (newest === undefined || sequence > newest) newest = sequence
    }
    return { oldest, newest }
  }

  const findCachedMedia = (track: 'audio' | 'video', formatKey: string, startTimeMs: number) => {
    let closest: CachedMedia | undefined
    for (const segment of mediaCache.values()) {
      if (segment.track !== track || segment.formatKey !== formatKey) continue
      if (Math.abs(segment.startMs - startTimeMs) > START_TIME_TOLERANCE_MS) continue
      if (!closest || Math.abs(segment.startMs - startTimeMs) < Math.abs(closest.startMs - startTimeMs)) {
        closest = segment
      }
    }
    return closest
  }

  const withAbort = <T>(promise: Promise<T>, signal?: AbortSignal) => {
    if (!signal) return promise
    if (signal.aborted) return Promise.reject(signal.reason)
    return new Promise<T>((resolve, reject) => {
      const aborted = () => reject(signal.reason)
      signal.addEventListener('abort', aborted, { once: true })
      void promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', aborted))
    })
  }

  const cancelActiveHarvest = async () => {
    const harvest = activeHarvest
    if (!harvest) return
    activeHarvest = undefined
    notifyCacheChange()
    await harvest.reader.cancel().catch(() => {})
  }

  let chain: Promise<unknown> = Promise.resolve()
  // inits fork from the last serial operation so they never overtake pending media work
  let serialTail: Promise<unknown> = Promise.resolve()

  // SabrStreamingAdapter only resets its buffered-range tracking on a *backward* seek
  // clearing it on ANY seek is what makes the next request look like a fresh start; without it the request claims a tiny buffered window far behind the position and the server withholds media entirely (streamProtectionStatus 2 + PLAYBACK_START_POLICY, no MEDIA parts), which the retry loop refresh-loops on
  // the playback cookie is deliberately NOT reset here: it carries session/format state and a seek only changes playerTimeMs, not the session
  let seekGeneration = 0
  const resetBufferTracking = () => {
    const internals = adapter as unknown as { initializedFormats?: { clear?: () => void } }
    internals.initializedFormats?.clear?.()
  }

  const selectFormat = (track: 'audio' | 'video', key: string) => {
    const formats = track === 'video' ? videoFormats : audioFormats
    const next = formats.find((format) => format.key === key)
    if (!next) throw new Error(`youtube: unknown ${track} format ${key}`)
    void cancelActiveHarvest()
    // the live timeline deliberately SURVIVES a format switch: sequence numbers are aligned across formats
    if (track === 'video') {
      videoFormat = next
      state.video = byKey.get(next.key)
    } else {
      audioFormat = next
      state.audio = byKey.get(next.key)
    }
    return next
  }

  const execute = async (
    url: string,
    requestHeaders: Record<string, string>,
    startTimeMs: number,
    init: boolean,
    generation: number,
    progress: (phase: string) => void,
    signal?: AbortSignal,
    attempt = 0,
    dualTrack = false,
  ): Promise<ExecutedResponse> => {
    if (signal?.aborted) throw signal.reason
    const request: PlayerHttpRequest = {
      url,
      method: 'GET',
      headers: requestHeaders,
      segment: {
        getStartTime: () => startTimeMs / 1_000,
        isInit: () => init,
      },
    }
    progress('request-filter')
    const filtered = await state.requestFilter?.(request) ?? request
    let requestBody = bytes(filtered.body)
    if (requestBody && filtered.url.includes('googlevideo.com')) {
      const decoded = VideoPlaybackAbrRequest.decode(requestBody)
      decoded.clientAbrState ??= {}
      decoded.clientAbrState.playbackAuthorization ??= {
        authorizedFormats: [
          { trackType: 1, isHdr: false },
          { trackType: 2, isHdr: false },
          { trackType: 2, isHdr: true },
        ],
      }
      decoded.clientAbrState.clientViewportWidth = state.snapshot.viewportWidth
      decoded.clientAbrState.clientViewportHeight = state.snapshot.viewportHeight
      decoded.clientAbrState.av1QualityThreshold = 1_080
      // the adapter's trip through seconds sends 9007199254740990, which googlevideo answers sabr.invalid_input_stream (measured 2026-11-11)
      if (startTimeMs === LIVE_HEAD_MS) decoded.clientAbrState.playerTimeMs = String(LIVE_HEAD_MS)
      const cachedTracks = new Set(Array.from(mediaCache.values(), (segment) => segment.track))
      if (init && dualTrack && state.audio && state.video && cachedTracks.size < 2) {
        decoded.clientAbrState.enabledTrackTypesBitfield = 0
        decoded.clientAbrState.audioTrackId = state.audio.audioTrackId
        decoded.clientAbrState.drcEnabled = state.audio.isDrc ?? false
        decoded.clientAbrState.stickyResolution = state.video.height
        decoded.clientAbrState.lastManualSelectedResolution = state.video.height
        decoded.preferredAudioFormatIds = [state.audio]
        decoded.preferredVideoFormatIds = [state.video]
        decoded.selectedFormatIds = []
        decoded.bufferedRanges = []
      }
      // the adapter claims the segment the pump just delivered as buffered, and a live init asked there is answered with no video at all (measured 2026-11-06: three empty answers, then a session refresh)
      if (init && source.isLive) decoded.bufferedRanges = []
      requestBody = Uint8Array.of(...VideoPlaybackAbrRequest.encode(decoded).finish(), ...encodeSsapPlaybackInfos(announcedCuepoints()))
      filtered.body = requestBody
    }
    const metadata = state.metadata?.getRequestMetadata(filtered.url)
    if (!metadata) throw new Error('youtube: SABR request metadata is missing')
    const started = performance.now()
    progress('fetch')
    const response = await egressFetch(filtered.url, {
      method: filtered.method,
      headers: {
        ...filtered.headers,
        origin: 'https://www.youtube.com',
        referer: 'https://www.youtube.com/',
        'content-type': 'application/x-protobuf',
      },
      body: requestBody ? Uint8Array.from(requestBody).buffer : undefined,
      redirect: 'manual',
    }, signal)
    progress('headers')
    if (response.status === 403 && attempt === 0) {
      await response.body?.cancel()
      progress('token-reset')
      await source.recoverMint()
      return execute(url, requestHeaders, startTimeMs, init, generation, progress, signal, attempt + 1, dualTrack)
    }
    if (!response.ok) {
      if (response.status === 403) await source.recoverMint()
      throw refreshError(`youtube: segment returned ${response.status}`)
    }
    const processor = new SabrUmpProcessor(metadata, state.cache ?? undefined)
    const collector = createUmpSegmentCollector()
    const framer = createUmpFramer()
    const reader = response.body?.getReader()
    const partTypes: number[] = []
    type ProcessingResult = Awaited<ReturnType<typeof processor.processChunk>>
    let result: ProcessingResult
    let readerDone = false
    const process = async (chunk: Uint8Array) => {
      for (const frame of framer.push(chunk)) {
        partTypes.push(frame.type)
        if (frame.type === UMPPartId.LIVE_METADATA) noteLiveHead(frame.payload)
        if (frame.type === CUEPOINT_LIST && source.isLive) noteCuepoints(frame.payload)
        const collected = collector.push(frame)
        if (collected) storeCollectedSegment(collected, startTimeMs)
        const mediaPart = frame.type === UMPPartId.MEDIA_HEADER
          || frame.type === UMPPartId.MEDIA
          || frame.type === UMPPartId.MEDIA_END
        if (!result || !mediaPart) {
          const next = await processor.processChunk(frame.data)
          if (next?.done && !result) result = next
        }
      }
    }
    if (reader) {
      while (!result) {
        const chunk = await reader.read()
        if (chunk.done) {
          readerDone = true
          break
        }
        progress('body')
        await process(chunk.value)
      }
    } else {
      const chunk = new Uint8Array(await response.arrayBuffer())
      progress('body')
      await process(chunk)
      readerDone = true
    }
    const data = result?.data
    const mediaHeader = metadata.streamInfo?.mediaHeader
    const expectedLength = Number(mediaHeader?.contentLength ?? 0)
    const actualLength = data?.byteLength ?? 0
    const incomplete = !init && expectedLength > 0 && actualLength !== expectedLength
      ? { actual: actualLength, expected: expectedLength }
      : undefined
    if (incomplete && metadata.streamInfo) delete metadata.streamInfo.mediaHeader
    const output: ExecutedResponse = {
      url: filtered.url,
      method: filtered.method,
      headers: headers(response.headers),
      data,
      makeRequest: (nextUrl, nextHeaders) => execute(
        nextUrl,
        nextHeaders,
        startTimeMs,
        init,
        generation,
        progress,
        signal,
        0,
        dualTrack,
      ),
      metadata,
      elapsedMs: performance.now() - started,
      incomplete,
      endOfTrack: partTypes.includes(UMPPartId.END_OF_TRACK),
      partial: framer.partial,
      partTypes: [...partTypes],
    }
    progress('response-filter')
    const modified = await state.responseFilter?.(output)
    Object.assign(output, modified)
    if (incomplete && mediaHeader) {
      metadata.streamInfo ??= {}
      metadata.streamInfo.mediaHeader = mediaHeader
    }
    if (reader && result?.done && !readerDone) {
      const harvest = {
        done: Promise.resolve(),
        formatKeys: new Set([state.audio, state.video].flatMap((format) => {
          const key = FormatKeyUtils.fromFormat(format)
          return key ? [key] : []
        })),
        generation,
        reader,
      } satisfies ActiveHarvest
      activeHarvest = harvest
      harvest.done = (async () => {
        for (;;) {
          const chunk = await reader.read()
          if (chunk.done) break
          await process(chunk.value)
        }
      })().catch(() => {}).finally(() => {
        collector.clear()
        if (activeHarvest === harvest) activeHarvest = undefined
        notifyCacheChange()
      })
    } else {
      collector.clear()
    }
    output.elapsedMs = performance.now() - started
    return output
  }

  let livePump: Promise<void> | undefined
  // a position the server keeps answering with no media
  let refused: { atMs: number, count: number } | undefined

  const runLivePump = async () => {
    while (!closeController.signal.aborted) {
      try {
        const filing = activeHarvest
        if (filing) {
          await filing.done
          continue
        }
        const fromMs = liveEndMs()
        /* NOT on `chain`: at the head the server holds this request until the next segment exists (about one segment,
           measured 4.4 to 5.5 s), and every cached answer queued behind it waited as long. So it runs beside Shaka's
           requests on the one adapter: they share its request counter (each answer finds its own metadata by `rn`), its
           playback cookie (the newest answer's wins) and the activeHarvest slot (the newest harvest's), and every answer
           is filed by its own media headers, whichever request carried it. */
        const response = await execute(
          `sabr://video?key=${encodeURIComponent(videoFormat.key)}`,
          {},
          insideLiveSegment(fromMs),
          false,
          seekGeneration,
          () => {},
          closeController.signal,
        )
        await activeHarvest?.done
        if (liveEndMs() > fromMs) {
          refused = undefined
          continue
        }
        if (!response.data?.byteLength) {
          await recoverFor(response.metadata.streamInfo?.streamProtectionStatus?.status)
          refused = refused?.atMs === fromMs ? { atMs: fromMs, count: refused.count + 1 } : { atMs: fromMs, count: 1 }
          /* measured 2026-11-06: a position answered "backoff, no media" again once the head is past it stays refused
             for good, to a new SABR session too (7 and 11 reopened sessions in a row), while the next one is served. Every
             such refusal measured on 2026-11-10 announced an ad cuepoint, which naming it clears (see cuepoints). One that
             stays refused all the same is stepped past, and the manifest lists only the run after the hole ($Number$ is
             positional, see contiguousTail), which Shaka moves forward into. */
          if (refused.count >= LIVE_REFUSALS && liveHeadMs !== undefined && liveHeadMs > fromMs) {
            liveStartMs = Math.max(liveStartMs ?? 0, fromMs + targetDurationMs)
            refused = undefined
          }
        }
        // never asked again at once: the adapter already waits out the server's own backoff before its next request
        await wait(Math.round(targetDurationMs / 2), closeController.signal)
      } catch {
        if (closeController.signal.aborted) return
        await wait(1_000, closeController.signal).catch(() => {})
      }
    }
  }

  const ensureLivePump = () => {
    if (!source.isLive || livePump || closeController.signal.aborted) return
    livePump = runLivePump().finally(() => {
      livePump = undefined
    })
  }

  const initFetches = new Map<string, Promise<Uint8Array>>()
  // init blob fetches are shared between requesters, so they die with the session, not with one signal
  const closeController = new AbortController()

  const initCacheKey = (formatKey: string) => {
    const sabrFormat = byKey.get(formatKey)
    return sabrFormat && FormatKeyUtils.createSegmentCacheKey({
      itag: sabrFormat.itag,
      xtags: sabrFormat.xtags,
      isInitSeg: true,
    } as never, sabrFormat)
  }

  const fetchInitBlob = async (
    track: 'audio' | 'video',
    format: PlaybackFormat,
    startTimeMs: number,
    generation: number,
    progress: (phase: string) => void,
    dualTrack: boolean,
    attempt = 0,
  ): Promise<Uint8Array> => {
    const end = Math.max(format.initRange?.end ?? 0, format.indexRange?.end ?? 0)
    const response = await execute(
      `sabr://${track}?key=${encodeURIComponent(format.key)}`,
      // `bytes=0-0` would return one byte, get cached, and fail every later append (shaka 3014)
      format.initRange ? { Range: `bytes=0-${end}` } : {},
      startTimeMs,
      true,
      generation,
      progress,
      closeController.signal,
      0,
      dualTrack,
    )
    // which answer is the init depends on how it was asked: a RANGE request (VOD) returns the init+index head as the BODY, a rangeless one (live) returns a several-hundred-KB MEDIA blob as the body while the real init arrives on the stream, filed under the same key by storeCollectedSegment
    // preferring the body for live hands MSE media as an init segment, leaving readyState and videoWidth at 0 with no error
    const collected = bytes(state.cache?.getInitSegment(initCacheKey(format.key) ?? ''))
    const data = format.initRange
      ? bytes(response.data)
      : initSegmentPrefix(collected?.byteLength ? collected : bytes(response.data) ?? new Uint8Array())
    if (data?.byteLength) {
      const cacheKey = initCacheKey(format.key)
      if (cacheKey) {
        const existing = bytes(state.cache?.getInitSegment(cacheKey))
        if (!existing || existing.byteLength < data.byteLength) state.cache?.setInitSegment(cacheKey, data)
        notifyCacheChange()
      }
      try {
        if (response.url.includes('googlevideo.com')) localStorage.setItem(GVS_ORIGIN_KEY, new URL(response.url).origin)
      } catch {}
      return data
    }
    if (response.metadata.streamInfo?.reloadPlaybackContext) throw refreshError(`youtube: ${describeNoMedia(response)}`)
    if (attempt + 1 < MAX_SEGMENT_ATTEMPTS) {
      const streamStatus = response.metadata.streamInfo?.streamProtectionStatus?.status
      await recoverFor(streamStatus)
      const serverBackoff = response.metadata.streamInfo?.nextRequestPolicy?.backoffTimeMs ?? 0
      progress('retry')
      await wait(Math.min(2_000, Math.max(serverBackoff, 200 * 2 ** attempt)), closeController.signal)
      return fetchInitBlob(track, format, startTimeMs, generation, progress, dualTrack, attempt + 1)
    }
    throw refreshError(`youtube: ${describeNoMedia(response)} after ${MAX_SEGMENT_ATTEMPTS} attempts`)
  }

  const requestSegment = (
    request: SegmentRequest,
    progress: (phase: string) => void = () => {},
    signal?: AbortSignal,
  ) => {
    if (request.generation > seekGeneration) {
      seekGeneration = request.generation
      resetBufferTracking()
    }
    const base = request.kind === 'init' ? serialTail : chain
    const run = base.then(async () => {
      if (signal?.aborted) throw signal.reason
      state.snapshot = request.snapshot
      const currentFormat = request.track === 'video' ? videoFormat : audioFormat
      const format = request.formatKey && request.formatKey !== currentFormat.key
        ? selectFormat(request.track, request.formatKey)
        : currentFormat
      const requestedRange = request.range ?? (request.kind === 'init' ? format.initRange : undefined)
      // a live init is answered with media too, so it is asked at the timeline rather than at 0
      const startTimeMs = source.isLive && request.kind === 'init'
        ? [...liveTimeline.values()].reduce((newest, segment) => Math.max(newest, segment.startMs), Math.max(request.startTimeMs, liveStartMs ?? 0))
        : request.startTimeMs
      const range = requestedRange ? `bytes=${requestedRange.start}-${requestedRange.end}` : undefined
      const getCachedSegment = (): SegmentEnvelope | undefined => {
        if (request.kind === 'init' && requestedRange) {
          const cacheKey = initCacheKey(format.key)
          const cached = cacheKey ? bytes(state.cache?.getInitSegment(cacheKey)) : undefined
          if (!cached || requestedRange.end >= cached.byteLength) return
          return {
            generation: request.generation,
            track: request.track,
            kind: request.kind,
            formatKey: format.key,
            mimeType: format.mimeType,
            elapsedMs: 0,
            end: false as const,
            data: cached.slice(requestedRange.start, requestedRange.end + 1).buffer,
          }
        }
        if (request.kind === 'media') {
          const cached = request.sequenceNumber === undefined
            ? findCachedMedia(request.track, format.key, request.startTimeMs)
            : findCachedSequence(request.track, format.key, request.sequenceNumber)
          if (!cached) return
          return {
            generation: request.generation,
            track: request.track,
            kind: request.kind,
            formatKey: format.key,
            mimeType: format.mimeType,
            elapsedMs: 0,
            end: false as const,
            sequenceNumber: cached.sequenceNumber,
            startMs: cached.startMs,
            durationMs: cached.durationMs,
            data: Uint8Array.from(cached.data).buffer as ArrayBuffer,
          }
        }
      }
      const getHarvestedSegment = async () => {
        let cached = getCachedSegment()
        if (cached) return cached
        const harvest = activeHarvest
        if (!harvest) return
        if (harvest.generation !== request.generation || !harvest.formatKeys.has(format.key)) {
          await cancelActiveHarvest()
          return
        }
        while (activeHarvest === harvest) {
          const changed = cacheChange
          progress('cache-wait')
          await withAbort(Promise.race([changed, harvest.done]), signal)
          cached = getCachedSegment()
          if (cached) return cached
        }
        return getCachedSegment()
      }
      const fetchSegment = async (attempt = 0): Promise<SegmentEnvelope> => {
        const harvested = await getHarvestedSegment()
        if (harvested) return harvested
        const response = await execute(
          `sabr://${request.track}?key=${encodeURIComponent(format.key)}`,
          range ? { Range: range } : {},
          startTimeMs,
          request.kind === 'init',
          request.generation,
          progress,
          signal,
        )
        const common = {
          generation: request.generation,
          track: request.track,
          kind: request.kind,
          formatKey: format.key,
          mimeType: format.mimeType,
          elapsedMs: response.elapsedMs,
        }
        const raw = bytes(response.data)
        const data = raw && request.kind === 'init' && !requestedRange ? initSegmentPrefix(raw) : raw
        const media = response.metadata.streamInfo?.mediaHeader
        if (data?.byteLength && !response.incomplete) {
          return {
            ...common,
            end: false,
            sequenceNumber: media?.sequenceNumber,
            startMs: media?.startMs !== undefined ? Number(media.startMs) : undefined,
            durationMs: media?.durationMs !== undefined ? Number(media.durationMs) : undefined,
            data: Uint8Array.from(data).buffer as ArrayBuffer,
          }
        }
        if (request.kind === 'media' && response.endOfTrack && !data?.byteLength) {
          return { ...common, end: true }
        }
        const streamStatus = response.metadata.streamInfo?.streamProtectionStatus?.status
        const reason = response.incomplete
          ? `incomplete segment ${response.incomplete.actual}/${response.incomplete.expected}`
          : describeNoMedia(response)
        if (response.metadata.streamInfo?.reloadPlaybackContext) throw refreshError(`youtube: ${reason}`)
        if (attempt + 1 < MAX_SEGMENT_ATTEMPTS) {
          await recoverFor(streamStatus)
          const serverBackoff = response.metadata.streamInfo?.nextRequestPolicy?.backoffTimeMs ?? 0
          progress('retry')
          await wait(Math.min(2_000, Math.max(serverBackoff, 200 * 2 ** attempt)), signal)
          return fetchSegment(attempt + 1)
        }
        throw refreshError(`youtube: ${reason} after ${MAX_SEGMENT_ATTEMPTS} attempts`)
      }
      const awaitLiveSequence = async (sequenceNumber: number): Promise<SegmentEnvelope> => {
        const deadline = Date.now() + LIVE_SEGMENT_WAIT_MS
        ensureLivePump()
        let fetched = false
        for (;;) {
          // captured BEFORE the lookup: a segment can land between the miss and the await
          const changed = cacheChange
          const cached = getCachedSegment()
          if (cached) return cached
          /* behind what the pump has reached, so the pump will never bring it in this format: listed because another
             format or the other track delivered it (Shaka opening on its own pick, a quality switch), or older than a
             refreshed session's start. The server answers it by its address. */
          const addressMs = liveTimeline.get(sequenceNumber)?.startMs
            ?? (request.startTimeMs < liveEndMs() ? request.startTimeMs : undefined)
          if (addressMs !== undefined && !fetched) {
            const harvest = activeHarvest
            if (harvest?.formatKeys.has(format.key)) {
              progress('live-wait')
              await withAbort(Promise.race([changed, harvest.done]), signal)
              continue
            }
            fetched = true
            progress('live-fetch')
            const response = await execute(
              `sabr://${request.track}?key=${encodeURIComponent(format.key)}`,
              {},
              insideLiveSegment(addressMs),
              false,
              request.generation,
              progress,
              signal,
            )
            if (!response.data?.byteLength) await recoverFor(response.metadata.streamInfo?.streamProtectionStatus?.status)
            continue
          }
          // Plain errors, NEVER refreshError: a refresh starts with an empty live timeline and the manifest is generated from it
          const { oldest, newest } = cachedSequenceRange(request.track, format.key)
          if (oldest !== undefined && sequenceNumber < oldest) {
            throw new Error(`youtube: live segment ${sequenceNumber} is older than the session window`)
          }
          if (newest !== undefined && sequenceNumber <= newest) {
            throw new Error(`youtube: live segment ${sequenceNumber} was not delivered`)
          }
          if (Date.now() > deadline) {
            throw new Error(`youtube: live segment ${sequenceNumber} did not arrive in time`)
          }
          progress('live-wait')
          await withAbort(changed, signal)
        }
      }
      if (request.kind === 'media' && request.sequenceNumber !== undefined) {
        return awaitLiveSequence(request.sequenceNumber)
      }
      if (request.kind === 'init' && requestedRange) {
        const cached = getCachedSegment()
        if (cached) return cached
        let blobPromise = initFetches.get(format.key)
        if (!blobPromise) {
          const wantDual = initFetches.size === 0
          blobPromise = fetchInitBlob(request.track, format, startTimeMs, request.generation, progress, wantDual)
          initFetches.set(format.key, blobPromise)
          void blobPromise.catch(() => {}).finally(() => {
            if (initFetches.get(format.key) === blobPromise) initFetches.delete(format.key)
          })
        }
        const blob = await withAbort(blobPromise, signal)
        if (requestedRange.end < blob.byteLength) {
          return {
            generation: request.generation,
            track: request.track,
            kind: request.kind,
            formatKey: format.key,
            mimeType: format.mimeType,
            elapsedMs: 0,
            end: false as const,
            data: blob.slice(requestedRange.start, requestedRange.end + 1).buffer as ArrayBuffer,
          } satisfies SegmentEnvelope
        }
        return fetchSegment()
      }
      return fetchSegment()
    })
    if (request.kind === 'init') {
      chain = Promise.allSettled([chain, run]).then(() => {})
    } else {
      chain = run.catch(() => {})
      serialTail = chain
    }
    return run
  }

  return {
    durationMs: source.durationMs,
    manifest: source.manifest,
    videoFormats,
    audioFormats,
    targetDurationMs,
    get liveSegments() { return [...liveTimeline.values()] },
    get liveEndMs() { return liveEndMs() },
    startLivePump: ensureLivePump,
    get videoFormat() { return videoFormat },
    get audioFormat() { return audioFormat },
    requestSegment,
    selectVideoFormat: (key: string) => selectFormat('video', key),
    selectAudioFormat: (key: string) => selectFormat('audio', key),
    close: () => {
      closeController.abort(new Error('youtube: playback session closed'))
      initFetches.clear()
      void cancelActiveHarvest()
      mediaCache.clear()
      mediaCacheBytes = 0
      adapter.dispose()
    },
  }
}
