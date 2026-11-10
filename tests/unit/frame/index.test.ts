import type { MockInstance } from 'vite-plus/test'

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import type { SabrSource } from '../../../src/frame/innertube'
import type { FrameRequest, FrameResponse, PlaybackSession, SegmentRequest } from '../../../src/frame/protocol'
import { getSabrSource } from '../../../src/frame/innertube'
import { FRAME_CONNECT, STREAM_REFUSED } from '../../../src/frame/protocol'
import { createSabrSession } from '../../../src/frame/sabr'

vi.mock('../../../src/frame/innertube', () => ({
  GVS_ORIGIN_KEY: 'gvs-origin',
  catalogInnertube: vi.fn(),
  getSabrSource: vi.fn(),
  hasSessionCookie: () => false,
  prefetchInitialPlayerResponse: vi.fn(),
}))
vi.mock('../../../src/frame/sabr', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../src/frame/sabr')>(),
  createSabrSession: vi.fn(),
}))

type Session = ReturnType<typeof createSabrSession>
type Fetch = (request: SegmentRequest, progress: unknown, signal: AbortSignal) => Promise<never>

const video = { key: '399:', mimeType: 'video/mp4' }
const audio = { key: '251:', mimeType: 'audio/webm' }

// a SABR session whose every segment request ends as `fetch` says
const sessionOf = (fetch: Fetch) => ({
  manifest: '<MPD/>',
  durationMs: 213_000,
  videoFormats: [video],
  audioFormats: [audio],
  videoFormat: video,
  audioFormat: audio,
  selectVideoFormat: () => {},
  selectAudioFormat: () => {},
  startLivePump: () => {},
  close: () => {},
  requestSegment: fetch,
}) as unknown as Session

const untilCancelled: Fetch = (_request, _progress, signal) =>
  new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))

const failing = (error: () => unknown): Fetch => async () => { throw error() }

const refreshError = () => Object.assign(new Error('youtube: SABR stream status 2 after 3 attempts'), { name: 'SabrSessionRefreshError' })

const segment = (requestId: string, sessionId: string): SegmentRequest => ({
  requestId,
  sessionId,
  generation: 0,
  track: 'video',
  kind: 'media',
  startTimeMs: 0,
  snapshot: { currentTimeMs: 0, playbackRate: 1, bandwidthEstimate: 10_000_000, viewportWidth: 1_280, viewportHeight: 720 },
})

let call: <Method extends FrameRequest['method']>(method: Method, ...args: Extract<FrameRequest, { method: Method }>['args']) => Promise<FrameResponse>

// the frame as the app realm reaches it: its FRAME_CONNECT hook, handed a port
beforeAll(async () => {
  vi.stubGlobal('window', {})
  vi.stubGlobal('document', { documentElement: { dataset: {} } })
  await import('../../../src/frame/index')
  let deliver: (event: { data: FrameRequest }) => void = () => {}
  const answers = new Map<number, (response: FrameResponse) => void>()
  const port = {
    addEventListener: (_type: string, listener: typeof deliver) => { deliver = listener },
    start: () => {},
    postMessage: (message: FrameResponse | { progress: string }) => {
      if ('id' in message && !('progress' in message)) answers.get(message.id)?.(message)
    },
  }
  ;(window as unknown as Record<string, (port: unknown) => void>)[FRAME_CONNECT]!(port)
  let id = 0
  call = (method, ...args) => new Promise((resolve) => {
    answers.set(++id, resolve)
    deliver({ data: { id, method, args } as FrameRequest })
  })
})

const open = async (fetch: Fetch) => {
  vi.mocked(createSabrSession).mockImplementation(() => sessionOf(fetch))
  const response = await call('openPlayback', 'video-1')
  return (response.result as PlaybackSession).id
}

describe("the frame's log of failed calls", () => {
  let errors: MockInstance<typeof console.error>

  beforeEach(() => {
    errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(getSabrSource).mockResolvedValue({ isLive: false, captions: [], storyboards: [] } as unknown as SabrSource)
  })

  afterEach(() => {
    errors.mockRestore()
  })

  it('leaves out a segment request the app cancelled, as when a viewer leaves a playing video', async () => {
    const id = await open(untilCancelled)
    const request = call('requestSegment', segment('a', id))
    await call('cancelSegment', id, 'a')
    expect(await request).toMatchObject({ error: 'youtube: segment request cancelled' })
    const closed = call('requestSegment', segment('b', id))
    await call('closePlayback', id)
    expect(await closed).toMatchObject({ error: 'youtube: segment request cancelled' })
    expect(errors).not.toHaveBeenCalled()
  })

  it('leaves out an abort', async () => {
    const id = await open(failing(() => new DOMException('The operation was aborted', 'AbortError')))
    expect(await call('requestSegment', segment('a', id))).toMatchObject({ error: 'The operation was aborted' })
    expect(errors).not.toHaveBeenCalled()
  })

  it('logs every other failure', async () => {
    const id = await open(failing(() => new Error('youtube: SABR answered 500')))
    await call('requestSegment', segment('a', id))
    await call('requestSegment', segment('b', id))
    await call('captionCues', id, 'en')
    expect(errors.mock.calls.map(([line, error]) => `${line} ${(error as Error).message}`)).toEqual([
      'yt-client: requestSegment failed youtube: SABR answered 500',
      'yt-client: requestSegment failed youtube: SABR answered 500',
      'yt-client: captionCues failed youtube: unknown caption track en',
    ])
  })

  it('logs a refused stream once, though each later segment request fails with it', async () => {
    const id = await open(failing(refreshError))
    const failures = await Promise.all(['a', 'b', 'c'].map((requestId) => call('requestSegment', segment(requestId, id))))
    expect(failures.every((failure) => failure.error?.startsWith(STREAM_REFUSED))).toBe(true)
    expect(errors).toHaveBeenCalledTimes(1)
    expect(errors.mock.calls[0]?.[1]).toMatchObject({ message: expect.stringMatching(STREAM_REFUSED) })
  })
})

it('opens a hover preview on a watch page read with its card\'s params, and a click\'s with none', async () => {
  vi.mocked(getSabrSource).mockReset().mockResolvedValue({ isLive: false, captions: [], storyboards: [] } as unknown as SabrSource)
  vi.mocked(createSabrSession).mockImplementation(() => sessionOf(untilCancelled))
  await call('openPlayback', 'video-1', 360, 'params-1')
  await call('openPlayback', 'video-2')
  expect(vi.mocked(getSabrSource).mock.calls).toEqual([['video-1', 'params-1'], ['video-2', undefined]])
})

it('keeps a live manifest\'s DVR window across a session refresh, before the new session names one', async () => {
  vi.mocked(getSabrSource).mockReset().mockResolvedValue({ isLive: true, captions: [], storyboards: [] } as unknown as SabrSource)
  const delivered = (from: number) => Array.from({ length: 4 }, (_, index) => ({ sequenceNumber: from + index, startMs: (from + index) * 5_000, durationMs: 5_000 }))
  const videoFormat = { ...video, mimeType: 'video/mp4; codecs="avc1.4d401f"', bitrate: 1, width: 640, height: 360 }
  const audioFormat = { ...audio, mimeType: 'audio/webm; codecs="opus"', bitrate: 1 }
  const liveSession = (fetch: Fetch, segments: ReturnType<typeof delivered>, liveWindowStartMs?: number) => ({
    ...sessionOf(fetch),
    videoFormats: [videoFormat],
    audioFormats: [audioFormat],
    videoFormat,
    audioFormat,
    targetDurationMs: 5_000,
    liveSegments: segments,
    liveEndMs: segments.at(-1)!.startMs + 5_000,
    liveWindowStartMs,
  }) as unknown as Session
  const first = liveSession(async (request) => {
    if (request.requestId.endsWith(':live-probe')) return {} as never
    throw refreshError()
  }, delivered(1_000), 100 * 5_000)
  // the session a refresh opens has delivered its first segments but been told nothing of the window yet
  const next = liveSession(async () => ({}) as never, delivered(1_010))
  vi.mocked(createSabrSession).mockReset().mockReturnValueOnce(first).mockReturnValueOnce(next)
  const id = ((await call('openPlayback', 'live-1')).result as PlaybackSession).id
  const manifest = async () => (await call('liveManifest', id)).result as string
  const startNumber = (text: string) => text.match(/startNumber="(\d+)"/)?.[1]
  expect(startNumber(await manifest())).toBe('100')
  await call('requestSegment', { ...segment('a', id), sequenceNumber: 1_003 })
  expect(vi.mocked(createSabrSession)).toHaveBeenCalledTimes(2)
  const refreshed = await manifest()
  // the refreshed session's own newest segment, on the window the first session named
  expect(refreshed).toContain(`<S t="${1_013 * 5_000}" d="5000"/>`)
  expect(startNumber(refreshed)).toBe('100')
})
