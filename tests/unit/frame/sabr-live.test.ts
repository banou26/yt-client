import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { BinaryReader, BinaryWriter, WireType } from '@bufbuild/protobuf/wire'
import { LiveMetadata, MediaHeader, NextRequestPolicy, StreamProtectionStatus, UMPPartId, VideoPlaybackAbrRequest } from 'googlevideo/protos'
import type { SabrSource } from '../../../src/frame/innertube'
import type { SegmentRequest } from '../../../src/frame/protocol'
import { egressFetch } from '../../../src/frame/egress'
import { createSabrSession, LIVE_HEAD_MS } from '../../../src/frame/sabr'

vi.mock('../../../src/frame/egress', () => ({ egressFetch: vi.fn() }))
vi.mock('../../../src/frame/innertube', () => ({ GVS_ORIGIN_KEY: 'gvs-origin' }))

// recorded on rFZHOHl-L8A, 2026-11-06: a 12 h DVR window, 5 s segments, segment n starting at n * 5000 - 18400
const HEAD = 1_357_505
const WINDOW = 8_636
const startMsOf = (sequence: number) => sequence * 5_000 - 18_400
const sequenceAt = (playerTimeMs: number) => Math.floor((playerTimeMs + 18_400) / 5_000)
// where the session asks for a segment
const middleOf = (sequence: number) => startMsOf(sequence) + 2_500

const umpVarInt = (value: number) => {
  if (value < 128) return [value]
  if (value < 16_384) return [(value & 0x3f) | 0x80, value >> 6]
  if (value < 2_097_152) return [(value & 0x1f) | 0xc0, (value >> 5) & 0xff, value >> 13]
  throw new Error('test value is too large')
}
const part = (type: number, data: Uint8Array | number[]) => [...umpVarInt(type), ...umpVarInt(data.length), ...data]
// a segment's bytes name its format and sequence, so an answer filed under the wrong one shows
const mediaBytes = (itag: number, sequence: number) => [itag & 0xff, sequence & 0xff, (sequence >> 8) & 0xff, (sequence >> 16) & 0xff, 1]

const video134 = { itag: 134, lastModified: '1', width: 640, height: 360, mimeType: 'video/mp4; codecs="avc1.4d401e"', bitrate: 1, approxDurationMs: 0 }
const video244 = { itag: 244, lastModified: '1', width: 854, height: 480, mimeType: 'video/webm; codecs="vp9"', bitrate: 2, approxDurationMs: 0 }
const audio140 = { itag: 140, lastModified: '1', mimeType: 'audio/mp4; codecs="mp4a.40.2"', bitrate: 1, approxDurationMs: 0 }

const recoverMint = vi.fn(async () => {})
const source: SabrSource = {
  videoId: 'live-1',
  isLive: true,
  durationMs: 0,
  manifest: '',
  streamingUrl: 'https://rr1---sn-test.googlevideo.com/videoplayback?id=1',
  ustreamerConfig: 'AA==',
  formats: [video134, video244, audio140],
  playbackFormats: [
    { key: '134:', itag: 134, mimeType: video134.mimeType, bitrate: 1, width: 640, height: 360, targetDurationMs: 5_000 },
    { key: '244:', itag: 244, mimeType: video244.mimeType, bitrate: 2, width: 854, height: 480, targetDurationMs: 5_000 },
    { key: '140:', itag: 140, mimeType: audio140.mimeType, bitrate: 1, targetDurationMs: 5_000 },
  ],
  storyboards: [],
  captions: [],
  endScreen: [],
  clientInfo: { clientName: 1, clientVersion: '2.20261008.00.00' },
  mint: async () => 'AAAA',
  recoverMint,
}

const snapshot = { currentTimeMs: 0, playbackRate: 1, bandwidthEstimate: 10_000_000, viewportWidth: 1_280, viewportHeight: 720 }
const base: SegmentRequest = { requestId: 'base', sessionId: 's', generation: 0, track: 'video', kind: 'media', formatKey: '134:', startTimeMs: 0, snapshot }
// the frame's first request on a live session
const opening: SegmentRequest = { ...base, requestId: 'open', startTimeMs: LIVE_HEAD_MS }
const media = (formatKey: string, sequence: number, track: 'audio' | 'video' = 'video'): SegmentRequest =>
  ({ ...base, requestId: `${formatKey}${sequence}`, track, formatKey, sequenceNumber: sequence, startTimeMs: startMsOf(sequence) })

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/* The live server as measured: it answers a request at its playerTimeMs clamped into its DVR window, with that one
   segment of the preferred video format and of the audio, plus LIVE_METADATA naming its head. Its head moves on every
   5 s. A request past the head is held until that segment exists, or answered with status 3, but one at LIVE_HEAD_MS,
   where youtube.com's live player opens, is answered with the segment two behind the head (measured 2026-11-11). */
let openedAt = 0
const head = () => HEAD + Math.floor((Date.now() - openedAt) / 5_000)
let pastHead: 'hold' | 'status 3' = 'hold'
let status: number | undefined
// the status of the next answer only, with no media and no LIVE_METADATA, as a status 3 answer was measured
let nextStatus: number | undefined
// positions answered "backoff, no media" whatever the head
const refused = new Set<number>()
// ad cuepoints by sequence: answered "backoff, no media" with a CUEPOINT_LIST until a request names the cuepoint
const cuepoints = new Map<number, string>()
let cuepointSeconds = 60
// the next answer is the segment before the one its address falls in, as measured once after a refusal
let answerBehind = false
// every address on a segment's start is answered with the segment that ends there, as some sessions do for good
let startsBehind = false
type Named = { id: string, state: number, startMs: number, durationMs: number }
type Asked = { playerTimeMs: number, video?: number, at: number, answeredAt?: number, cuepoints: Named[] }
const asked: Asked[] = []
// a request's ssapPlaybackInfos (24), which googlevideo 4.0.4 does not decode
const namedCuepoints = (body: Uint8Array) => {
  const named: Named[] = []
  const request = new BinaryReader(body)
  while (request.pos < request.len) {
    const [field, wireType] = request.tag()
    if (field !== 24) {
      request.skip(wireType)
      continue
    }
    const info = new BinaryReader(request.bytes())
    const cuepoint = { id: '', state: 0, startMs: 0, durationMs: 0 }
    while (info.pos < info.len) {
      const [infoField, infoType] = info.tag()
      if (infoField === 7) cuepoint.id = info.string()
      else if (infoField === 8) cuepoint.state = info.int32()
      else if (infoField === 10) cuepoint.startMs = Number(info.int64())
      else if (infoField === 11) cuepoint.durationMs = Number(info.int64())
      else info.skip(infoType)
    }
    named.push(cuepoint)
  }
  return named
}
// as the server announces an ad cuepoint (60 s unless a case says otherwise), on the video track's 90 kHz clock
const cuepointList = (id: string, sequence: number) => new BinaryWriter()
  .tag(1, WireType.LengthDelimited).fork()
  .tag(1, WireType.LengthDelimited).fork()
  .tag(1, WireType.Varint).int32(1)
  .tag(2, WireType.Varint).int32(1)
  .tag(3, WireType.Bit64).double(cuepointSeconds)
  .tag(4, WireType.Bit64).double(0)
  .tag(6, WireType.LengthDelimited).string(id)
  .join()
  .tag(2, WireType.Varint).int32(2)
  .tag(3, WireType.Varint).int32(sequence)
  .tag(4, WireType.LengthDelimited).fork()
  .tag(1, WireType.Varint).int64(startMsOf(sequence) * 90)
  .tag(3, WireType.Varint).int32(90_000)
  .join()
  .join()
  .finish()
const serve = () => vi.mocked(egressFetch).mockImplementation(async (_url, options) => {
  await sleep(100)
  const body = new Uint8Array(options.body as ArrayBuffer)
  const request = VideoPlaybackAbrRequest.decode(body)
  const playerTimeMs = Number(request.clientAbrState?.playerTimeMs ?? 0)
  const entry: Asked = { playerTimeMs, video: request.preferredVideoFormatIds[0]?.itag, at: Date.now(), cuepoints: namedCuepoints(body) }
  asked.push(entry)
  const at = playerTimeMs === LIVE_HEAD_MS ? head() - 2 : Math.max(head() - WINDOW, sequenceAt(playerTimeMs - (startsBehind ? 1 : 0)))
  const sequence = at - (answerBehind ? 1 : 0)
  answerBehind = false
  if (sequence > head() && pastHead === 'status 3') status = 3
  const once = nextStatus
  nextStatus = undefined
  if (once !== undefined) return new Response(new Uint8Array(part(UMPPartId.STREAM_PROTECTION_STATUS, StreamProtectionStatus.encode({ status: once }).finish())))
  if (status !== undefined) return new Response(new Uint8Array(part(UMPPartId.STREAM_PROTECTION_STATUS, StreamProtectionStatus.encode({ status }).finish())))
  while (sequence > head()) await sleep(250)
  // the window's start in microsecond ticks, as measured
  const minSeekableTimeTicks = String(startMsOf(head() - WINDOW) * 1_000 + 333)
  const metadata = { headSequenceNumber: String(head()), headTimeMs: String(startMsOf(head())), minSeekableTimeTicks, minSeekableTimescale: 1_000_000 }
  const answer = [...part(UMPPartId.LIVE_METADATA, LiveMetadata.encode(metadata).finish())]
  const cuepoint = cuepoints.get(sequence)
  if (refused.has(sequence) || (cuepoint && !entry.cuepoints.some((named) => named.id === cuepoint))) {
    answer.push(...part(UMPPartId.NEXT_REQUEST_POLICY, NextRequestPolicy.encode({ backoffTimeMs: 5_000 }).finish()))
    if (cuepoint) answer.push(...part(69, cuepointList(cuepoint, sequence)))
  } else {
    // a format the request claims to hold at this sequence is not sent again
    const held = (itag: number) => request.bufferedRanges.some((range) => range.formatId?.itag === itag
      && range.startSegmentIndex! <= sequence && sequence <= range.endSegmentIndex!)
    const tracks = (request.clientAbrState?.enabledTrackTypesBitfield === 1 ? [140] : [entry.video ?? 134, 140]).filter((itag) => !held(itag))
    tracks.forEach((itag, headerId) => {
      const data = mediaBytes(itag, sequence)
      answer.push(...part(UMPPartId.MEDIA_HEADER, MediaHeader.encode({ headerId, itag, formatId: { itag, lastModified: '1' }, sequenceNumber: sequence, startMs: String(startMsOf(sequence)), durationMs: '5000', contentLength: String(data.length) }).finish()))
      answer.push(...part(UMPPartId.MEDIA, [headerId, ...data]))
      answer.push(...part(UMPPartId.MEDIA_END, [headerId]))
    })
  }
  entry.answeredAt = Date.now()
  return new Response(new Uint8Array(answer))
})

const sequenceOf = (data: ArrayBuffer) => {
  const bytes = new Uint8Array(data)
  return { itag: bytes[0], sequence: bytes[1]! | (bytes[2]! << 8) | (bytes[3]! << 16) }
}

describe('a live SABR session on a stream with a DVR window', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    openedAt = Date.now()
    pastHead = 'hold'
    status = undefined
    nextStatus = undefined
    refused.clear()
    cuepoints.clear()
    cuepointSeconds = 60
    answerBehind = false
    startsBehind = false
    asked.length = 0
    recoverMint.mockClear()
    vi.stubGlobal('MediaSource', { isTypeSupported: () => true })
    vi.stubGlobal('localStorage', { setItem: () => {}, getItem: () => null })
    vi.mocked(egressFetch).mockReset()
    serve()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  // as the frame opens a live session: a request at the head, then the pump
  const open = async (liveFromMs?: number) => {
    const session = createSabrSession(source, 360, liveFromMs)
    if (liveFromMs === undefined) {
      let answered: number | string | undefined
      void session.requestSegment(opening).then((segment) => { answered = segment.sequenceNumber }, (error: Error) => { answered = error.message })
      await vi.advanceTimersByTimeAsync(200)
      expect(answered, 'the opening request was not answered at once').toBe(HEAD - 2)
    }
    session.startLivePump()
    await vi.advanceTimersByTimeAsync(1_000)
    return session
  }
  const listed = (session: ReturnType<typeof createSabrSession>) => session.liveSegments.map((segment) => segment.sequenceNumber)

  it('opens at the head as youtube.com does, and lists the segment it is answered with', async () => {
    const session = await open()
    expect(asked[0]!.playerTimeMs).toBe(Number.MAX_SAFE_INTEGER)
    expect(listed(session)).toEqual([HEAD - 2, HEAD - 1, HEAD])
    expect(asked.slice(1).every((request) => request.playerTimeMs >= startMsOf(HEAD - 2))).toBe(true)
    session.close()
  })

  it('notes where the server\'s DVR window starts, which moves on with the head', async () => {
    const session = await open()
    expect(session.liveWindowStartMs).toBeCloseTo(startMsOf(HEAD - WINDOW) + 0.333, 3)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(session.liveWindowStartMs).toBeCloseTo(startMsOf(HEAD + 2 - WINDOW) + 0.333, 3)
    session.close()
  })

  it('opens near the head when its first answer is status 3, which names no head', async () => {
    nextStatus = 3
    const session = createSabrSession(source, 360)
    const answer = session.requestSegment(opening)
    await vi.advanceTimersByTimeAsync(1_000)
    expect((await answer).sequenceNumber).toBe(HEAD - 2)
    session.startLivePump()
    await vi.advanceTimersByTimeAsync(3_000)
    expect(Math.min(...listed(session))).toBe(HEAD - 2)
    session.close()
  })

  it('continues a refreshed session where the previous one got to, never at media time 0', async () => {
    const session = createSabrSession(source, 360, startMsOf(HEAD - 1))
    session.startLivePump()
    // the timeline a manifest refresh would read while the first answer is still on its way
    expect(session.liveSegments).toEqual([])
    await vi.advanceTimersByTimeAsync(1_000)
    expect(asked.map((request) => request.playerTimeMs)).toEqual([middleOf(HEAD - 1), middleOf(HEAD), middleOf(HEAD + 1)])
    expect(listed(session)).toEqual([HEAD - 1, HEAD])
    session.close()
  })

  it('answers a listed segment that the playing format never received by its address', async () => {
    const session = await open()
    // what is listed arrived as 134; Shaka then opens on 244, and the session follows it from there
    const init = session.requestSegment({ ...base, requestId: 'init', kind: 'init', formatKey: '244:' })
    await vi.advanceTimersByTimeAsync(1_000)
    await init
    const wanted = HEAD - 2
    const answer = session.requestSegment(media('244:', wanted))
      .then((segment) => sequenceOf(segment.data!), (error: Error) => error.message)
    await vi.advanceTimersByTimeAsync(500)
    expect(await answer).toEqual({ itag: 244, sequence: wanted })
    expect(asked).toContainEqual(expect.objectContaining({ playerTimeMs: middleOf(wanted), video: 244 }))
    session.close()
  })

  it('answers a refreshed session\'s request for a segment before its start by its address', async () => {
    const session = await open(startMsOf(HEAD))
    const answer = session.requestSegment(media('134:', HEAD - 2))
      .then((segment) => sequenceOf(segment.data!), (error: Error) => error.message)
    await vi.advanceTimersByTimeAsync(500)
    expect(await answer).toEqual({ itag: 134, sequence: HEAD - 2 })
    session.close()
  })

  it('keeps up with the head when every segment start is answered with the segment before it', async () => {
    startsBehind = true
    const session = await open()
    await vi.advanceTimersByTimeAsync(30_000)
    // the head moved on six segments in those 30 s
    expect(Math.max(...listed(session))).toBeGreaterThanOrEqual(HEAD + 5)
    session.close()
  })

  it('answers a segment by its address when every segment start is answered with the segment before it', async () => {
    const session = await open()
    // after the pump reached the head, so only the by-address request can bring this segment in 244
    startsBehind = true
    const init = session.requestSegment({ ...base, requestId: 'init', kind: 'init', formatKey: '244:' })
    await vi.advanceTimersByTimeAsync(1_000)
    await init
    const wanted = HEAD - 2
    const answer = session.requestSegment(media('244:', wanted))
      .then((segment) => sequenceOf(segment.data!), (error: Error) => error.message)
    await vi.advanceTimersByTimeAsync(25_000)
    expect(await answer).toEqual({ itag: 244, sequence: wanted })
    session.close()
  })

  it('files an answer one segment before the address it asked', async () => {
    answerBehind = true
    const session = await open(startMsOf(HEAD))
    await vi.advanceTimersByTimeAsync(3_000)
    expect(listed(session).slice(0, 2)).toEqual([HEAD - 1, HEAD])
    session.close()
  })

  it('asks a live init at the timeline, not at media time 0', async () => {
    const session = await open()
    const from = asked.length
    const init = session.requestSegment({ ...base, requestId: 'init', kind: 'init', formatKey: '244:' })
    await vi.advanceTimersByTimeAsync(300)
    await init
    expect(asked.slice(from).map((request) => request.playerTimeMs)).toContain(startMsOf(HEAD))
    expect(asked.slice(from).every((request) => request.playerTimeMs >= startMsOf(HEAD - 2))).toBe(true)
    expect(Math.min(...listed(session))).toBe(HEAD - 2)
    session.close()
  })

  it('answers a live init for the format the pump streams, though the pump just delivered that segment', async () => {
    const session = await open()
    const init = session.requestSegment({ ...base, requestId: 'init', kind: 'init', formatKey: '134:' })
      .then((segment) => sequenceOf(segment.data!), (error: Error) => error.message)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(await init).toEqual({ itag: 134, sequence: HEAD })
    session.close()
  })

  it('answers a cached segment while the request at the head is held open', async () => {
    const session = await open()
    const asking = Date.now()
    const answer = session.requestSegment(media('134:', HEAD - 1)).then(() => Date.now() - asking)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(await answer).toBeLessThan(500)
    session.close()
  })

  it('files a by-address answer and a held head answer in flight together under their own sequences', async () => {
    const session = await open()
    const held = asked.at(-1)!
    expect(held.playerTimeMs).toBe(middleOf(HEAD + 1))
    const byAddress = session.requestSegment(media('244:', HEAD - 1))
    await vi.advanceTimersByTimeAsync(500)
    const answered = await byAddress
    // the head's answer was still held when the by-address one came back
    expect(held.answeredAt).toBeUndefined()
    expect(sequenceOf(answered.data!)).toEqual({ itag: 244, sequence: HEAD - 1 })
    await vi.advanceTimersByTimeAsync(5_000)
    expect(held.answeredAt).toBeDefined()
    expect(listed(session)).toContain(HEAD + 1)
    const fromHead = await session.requestSegment(media('134:', HEAD + 1))
    expect(sequenceOf(fromHead.data!)).toEqual({ itag: 134, sequence: HEAD + 1 })
    expect(fromHead.startMs).toBe(startMsOf(HEAD + 1))
    session.close()
  })

  it('does not ask again at once after an answer with no media', async () => {
    pastHead = 'status 3'
    const session = await open()
    const from = Date.now()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(asked.filter((request) => request.at > from).length).toBeLessThanOrEqual(1)
    session.close()
  })

  it('replaces the BotGuard session when the pump is answered with status 3', async () => {
    const session = await open()
    status = 3
    await vi.advanceTimersByTimeAsync(10_000)
    expect(recoverMint).toHaveBeenCalled()
    session.close()
  })

  it('replaces it on status 2 in the pump once per stream', async () => {
    const session = await open()
    status = 2
    await vi.advanceTimersByTimeAsync(20_000)
    expect(recoverMint).toHaveBeenCalledTimes(1)
    session.close()
  })

  it('names the ad cuepoint the server announced, and is sent the segment at it', async () => {
    cuepoints.set(HEAD + 1, 'cue-1')
    const session = await open()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(listed(session)).toContain(HEAD + 1)
    expect(asked).toContainEqual(expect.objectContaining({
      playerTimeMs: middleOf(HEAD + 1),
      cuepoints: [{ id: 'cue-1', state: 11, startMs: startMsOf(HEAD + 1), durationMs: 60_000 }],
    }))
    // and stops naming it once the timeline passes the cuepoint's end, as youtube.com does
    await vi.advanceTimersByTimeAsync(70_000)
    expect(asked.at(-1)!.cuepoints).toEqual([])
    session.close()
  })

  it('names an ad cuepoint hours behind the head, as a seek into the window meets one, and is sent the segment at it', async () => {
    const far = HEAD - WINDOW / 2
    cuepoints.set(far, 'cue-far')
    const session = await open()
    const answer = session.requestSegment(media('134:', far))
      .then((segment) => sequenceOf(segment.data!), (error: Error) => error.message)
    await vi.advanceTimersByTimeAsync(15_000)
    expect(await answer).toEqual({ itag: 134, sequence: far })
    expect(asked).toContainEqual(expect.objectContaining({
      playerTimeMs: middleOf(far),
      cuepoints: [{ id: 'cue-far', state: 11, startMs: startMsOf(far), durationMs: 60_000 }],
    }))
    // and the pump at the head does not name it
    expect(asked.filter((request) => request.playerTimeMs > startMsOf(HEAD)).every((request) => request.cuepoints.length === 0)).toBe(true)
    session.close()
  })

  it('keeps the newest segments listed while segments hours behind the head are answered', async () => {
    const session = await open()
    // four minutes on, the timeline holds as many segments as it keeps
    await vi.advanceTimersByTimeAsync(250_000)
    const newest = listed(session)
    expect(newest).toHaveLength(48)
    for (const sequence of [HEAD - 100, HEAD - 99, HEAD - 98]) {
      const answer = session.requestSegment(media('134:', sequence))
      await vi.advanceTimersByTimeAsync(500)
      expect(sequenceOf((await answer).data!)).toEqual({ itag: 134, sequence })
    }
    expect(Math.min(...listed(session))).toBeGreaterThanOrEqual(Math.min(...newest))
    session.close()
  })

  it('names a cuepoint whose length is not a whole number of seconds', async () => {
    cuepointSeconds = 59.9995
    cuepoints.set(HEAD + 1, 'cue-1')
    const session = await open()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(listed(session)).toContain(HEAD + 1)
    expect(asked).toContainEqual(expect.objectContaining({ cuepoints: [expect.objectContaining({ id: 'cue-1', durationMs: 60_000 })] }))
    session.close()
  })

  it('ignores a cuepoint whose length is not a number, and keeps playing', async () => {
    cuepointSeconds = Number.NaN
    cuepoints.set(HEAD + 1, 'cue-1')
    const session = await open()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(Math.max(...listed(session))).toBeGreaterThanOrEqual(HEAD + 4)
    expect(asked.every(request => request.cuepoints.length === 0)).toBe(true)
    session.close()
  })

  it('moves past a position the server refuses for good once the head is past it', async () => {
    refused.add(HEAD + 1)
    const session = await open()
    await vi.advanceTimersByTimeAsync(30_000)
    const sequences = listed(session)
    expect(sequences).not.toContain(HEAD + 1)
    expect(Math.max(...sequences)).toBeGreaterThanOrEqual(HEAD + 4)
    session.close()
  })
})
