import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { StreamProtectionStatus, UMPPartId } from 'googlevideo/protos'
import type { SabrSource } from '../../../src/frame/innertube'
import type { SegmentRequest } from '../../../src/frame/protocol'
import { egressFetch } from '../../../src/frame/egress'
import { getSabrSource } from '../../../src/frame/innertube'
import { closePlaybackEntry, openPlaybackEntry, requestPlaybackSegment } from '../../../src/frame/playback'
import { STREAM_REFUSED } from '../../../src/frame/protocol'
import { createSabrSession } from '../../../src/frame/sabr'
import { createRestartBudget, isStreamRefusal } from '../../../src/player/restart'

vi.mock('../../../src/frame/egress', () => ({ egressFetch: vi.fn() }))
vi.mock('../../../src/frame/innertube', () => ({ GVS_ORIGIN_KEY: 'gvs-origin', getSabrSource: vi.fn() }))
vi.mock('../../../src/frame/sabr', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/frame/sabr')>()
  return { ...actual, createSabrSession: vi.fn(actual.createSabrSession) }
})

const { createSabrSession: realSession } = await vi.importActual<typeof import('../../../src/frame/sabr')>('../../../src/frame/sabr')

const video = { itag: 399, lastModified: '1', width: 1_920, height: 1_080, mimeType: 'video/mp4; codecs="av01.0.08M.08"', bitrate: 1, approxDurationMs: 213_000 }
const audio = { itag: 251, lastModified: '1', mimeType: 'audio/webm; codecs="opus"', bitrate: 1, approxDurationMs: 213_000 }
const recoverMint = vi.fn(async () => {})
const source: SabrSource = {
  videoId: 'video-1',
  isLive: false,
  durationMs: 213_000,
  manifest: '<MPD/>',
  streamingUrl: 'https://rr1---sn-test.googlevideo.com/videoplayback?id=1',
  ustreamerConfig: 'AA==',
  formats: [video, audio],
  playbackFormats: [
    { key: '399:', itag: 399, mimeType: video.mimeType, bitrate: 1, width: 1_920, height: 1_080 },
    { key: '251:', itag: 251, mimeType: audio.mimeType, bitrate: 1 },
  ],
  storyboards: [],
  captions: [],
  clientInfo: { clientName: 1, clientVersion: '2.20261008.00.00' },
  mint: async () => 'AAAA',
  recoverMint,
}
const segment = (requestId: string): SegmentRequest => ({
  requestId,
  sessionId: 'playback:1',
  generation: 0,
  track: 'video',
  kind: 'media',
  startTimeMs: 60_000,
  snapshot: { currentTimeMs: 60_000, playbackRate: 1, bandwidthEstimate: 10_000_000, viewportWidth: 1_280, viewportHeight: 720 },
})

// every SABR answer is status 2 with no media, the way YouTube answers a session it will not serve; one UMP part, whose
// type and size both fit a one-byte varint
const refuseEverySession = () => vi.mocked(egressFetch).mockImplementation(async () => {
  const status = StreamProtectionStatus.encode({ status: 2 }).finish()
  return new Response(new Uint8Array([UMPPartId.STREAM_PROTECTION_STATUS, status.byteLength, ...status]))
})

const failureOf = (request: Promise<unknown>) => request.then(() => 'delivered', (error: Error) => error.message)

const init = (requestId: string): SegmentRequest => ({ ...segment(requestId), kind: 'init', range: { start: 0, end: 700 } })

// the requests `served` picks (by the session's number, the first being 1) get a few bytes, the rest the SABR answers
const serve = (served: (request: SegmentRequest, session: number) => boolean) => {
  let sessions = 0
  vi.mocked(createSabrSession).mockImplementation((...args) => {
    const session = realSession(...args)
    const number = ++sessions
    const requestSegment: typeof session.requestSegment = (request, progress, signal) => served(request, number)
      ? Promise.resolve({ generation: request.generation, track: request.track, kind: request.kind, formatKey: '399:', mimeType: video.mimeType, elapsedMs: 1, end: false, data: new ArrayBuffer(8) })
      : session.requestSegment(request, progress, signal)
    return Object.create(session, { requestSegment: { value: requestSegment } }) as typeof session
  })
}

const sleep = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms) })

/* The player's side of the loop, as video-player.tsx and Shaka drive the frame: Shaka asks again a second after a
   failed segment; a refusal ends the playback, and the player opens the video again after the restart budget's wait,
   until the budget has none left. */
const watchRefusedVideo = async () => {
  const budget = createRestartBudget()
  let request = 0
  for (;;) {
    const { entry } = await openPlaybackEntry('video-1')
    for (;;) {
      const failure = await requestPlaybackSegment(entry, segment(`r${++request}`), () => {}).then(() => undefined, (error: Error) => error)
      if (!failure || isStreamRefusal(failure)) break
      await sleep(1_000)
    }
    closePlaybackEntry(entry)
    const wait = budget.refused()
    if (wait === undefined) return 'stopped'
    await sleep(wait)
  }
}

describe('a playback YouTube keeps refusing', () => {
  const reads: number[] = []

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    vi.stubGlobal('MediaSource', { isTypeSupported: () => true })
    vi.stubGlobal('document', { documentElement: { dataset: {} } })
    reads.length = 0
    recoverMint.mockClear()
    vi.mocked(egressFetch).mockReset()
    vi.mocked(getSabrSource).mockReset().mockImplementation(async () => {
      reads.push(Date.now())
      return source
    })
    refuseEverySession()
  })

  afterEach(() => {
    vi.mocked(createSabrSession).mockImplementation(realSession)
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  const perMinute = (from: number, minutes: number) => Array.from({ length: minutes }, (_, minute) =>
    reads.filter((at) => at >= from + minute * 60_000 && at < from + (minute + 1) * 60_000).length)

  it('reads the watch page again at once, then backs off 5, 15 and 45 s, then stops', async () => {
    const start = Date.now()
    let outcome: string | undefined
    void watchRefusedVideo().then((result) => { outcome = result })
    await vi.advanceTimersByTimeAsync(10 * 60_000)

    expect(perMinute(start, 10)).toEqual([6, 2, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(outcome).toBe('stopped')
    // the first recovery: the refresh follows the first refused request with no wait of its own
    expect(reads[1]! - reads[0]!).toBeLessThan(1_000)
    // each try is one open and one refresh, the tries 5, 15 and 45 s after the one before ended
    expect(reads).toHaveLength(8)
    const tries = [reads[2]! - reads[1]!, reads[4]! - reads[3]!, reads[6]! - reads[5]!]
    expect(tries.map((gap) => Math.round(gap / 5_000) * 5_000)).toEqual([5_000, 15_000, 45_000])
    // one new BotGuard session per SABR session, never one per request
    expect(recoverMint).toHaveBeenCalledTimes(8)
  })

  it('answers every later request at once, with no read, once refused', async () => {
    const { entry } = await openPlaybackEntry('video-1')
    const first = failureOf(requestPlaybackSegment(entry, segment('a'), () => {}))
    await vi.advanceTimersByTimeAsync(5_000)
    expect(await first).toBe(`${STREAM_REFUSED} (SABR stream status 2 after 3 attempts)`)
    const fetches = vi.mocked(egressFetch).mock.calls.length
    const later = await Promise.all(['b', 'c', 'd'].map((id) =>
      failureOf(requestPlaybackSegment(entry, { ...segment(id), track: id === 'c' ? 'audio' : 'video' }, () => {}))))
    expect(later).toEqual(Array(3).fill(`${STREAM_REFUSED} (SABR stream status 2 after 3 attempts)`))
    expect(vi.mocked(egressFetch).mock.calls.length).toBe(fetches)
    expect(reads).toHaveLength(2)
    closePlaybackEntry(entry)
  })

  it('refreshes once for requests that fail together', async () => {
    const { entry } = await openPlaybackEntry('video-1')
    const both = Promise.all([
      failureOf(requestPlaybackSegment(entry, segment('v'), () => {})),
      failureOf(requestPlaybackSegment(entry, { ...segment('a'), track: 'audio', kind: 'init', range: { start: 0, end: 700 } }, () => {})),
    ])
    await vi.advanceTimersByTimeAsync(10_000)
    expect((await both).every((message) => message.startsWith(STREAM_REFUSED))).toBe(true)
    expect(reads).toHaveLength(2)
    closePlaybackEntry(entry)
  })

  it('counts only media as served: an init the new session answers does not buy it a second refresh', async () => {
    serve((request) => request.kind === 'init')
    const { entry } = await openPlaybackEntry('video-1')
    let release: () => void = () => {}
    vi.mocked(getSabrSource).mockImplementationOnce(async () => {
      reads.push(Date.now())
      await new Promise<void>((resolve) => { release = resolve })
      return source
    })
    const first = failureOf(requestPlaybackSegment(entry, segment('a'), () => {}))
    await vi.advanceTimersByTimeAsync(2_000)
    expect(reads).toHaveLength(2)
    // a seek while the new session opens drops the old request, and the new position asks for its init first
    const initAnswer = failureOf(requestPlaybackSegment(entry, { ...init('b'), generation: 1 }, () => {}))
    const media = failureOf(requestPlaybackSegment(entry, { ...segment('c'), generation: 1 }, () => {}))
    release()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(await first).toBe('youtube: segment request cancelled')
    expect(await initAnswer).toBe('delivered')
    expect(await media).toMatch(STREAM_REFUSED)
    expect(reads).toHaveLength(2)
    closePlaybackEntry(entry)
  })

  it('replaces a session again on a later refusal once it delivered media', async () => {
    let delivered = 0
    serve((request, session) => request.kind === 'media' && session === 2 && ++delivered === 1)
    const { entry } = await openPlaybackEntry('video-1')
    const recovered = failureOf(requestPlaybackSegment(entry, segment('a'), () => {}))
    await vi.advanceTimersByTimeAsync(5_000)
    expect(await recovered).toBe('delivered')
    expect(reads).toHaveLength(2)
    const refused = failureOf(requestPlaybackSegment(entry, segment('b'), () => {}))
    await vi.advanceTimersByTimeAsync(10_000)
    expect(await refused).toMatch(STREAM_REFUSED)
    expect(reads).toHaveLength(3)
    closePlaybackEntry(entry)
  })

  it('reads nothing more once the playback is closed during its refresh', async () => {
    let release: () => void = () => {}
    const { entry } = await openPlaybackEntry('video-1')
    vi.mocked(getSabrSource).mockImplementation(async () => {
      reads.push(Date.now())
      await new Promise<void>((resolve) => { release = resolve })
      return source
    })
    const request = failureOf(requestPlaybackSegment(entry, segment('a'), () => {}))
    await vi.advanceTimersByTimeAsync(1_000)
    expect(reads).toHaveLength(2)
    closePlaybackEntry(entry)
    release()
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(await request).toBe('youtube: segment request cancelled')
    expect(reads).toHaveLength(2)
  })
})
