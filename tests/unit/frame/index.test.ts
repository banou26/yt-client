import type { MockInstance } from 'vite-plus/test'

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import type { SabrSource } from '../../../src/frame/innertube'
import type { FrameRequest, FrameResponse, PlaybackSession, SegmentRequest } from '../../../src/frame/protocol'
import { getSabrSource } from '../../../src/frame/innertube'
import { FRAME_CONNECT } from '../../../src/frame/protocol'
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
})
