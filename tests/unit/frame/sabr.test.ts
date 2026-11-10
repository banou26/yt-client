import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { MediaHeader, StreamProtectionStatus, UMPPartId } from 'googlevideo/protos'
import type { SabrSource } from '../../../src/frame/innertube'
import type { SegmentRequest } from '../../../src/frame/protocol'
import { egressFetch } from '../../../src/frame/egress'
import { createSabrSession, createUmpFramer, createUmpSegmentCollector, inspectUmpChunks } from '../../../src/frame/sabr'

vi.mock('../../../src/frame/egress', () => ({ egressFetch: vi.fn() }))
vi.mock('../../../src/frame/innertube', () => ({ GVS_ORIGIN_KEY: 'gvs-origin' }))

const encodeVarInt = (value: number) => {
  if (value < 128) return [value]
  if (value < 16_384) return [(value & 0x3f) | 0x80, value >> 6]
  throw new Error('test value is too large')
}

const part = (type: number, input: Iterable<number>) => {
  const data = [...input]
  return new Uint8Array([
    ...encodeVarInt(type),
    ...encodeVarInt(data.length),
    ...data,
  ])
}

const join = (parts: Uint8Array[]) => {
  const output = new Uint8Array(parts.reduce((size, value) => size + value.byteLength, 0))
  let offset = 0
  for (const value of parts) {
    output.set(value, offset)
    offset += value.byteLength
  }
  return output
}

describe('inspectUmpChunks', () => {
  it('recognizes an end-of-track response', () => {
    expect(inspectUmpChunks([new Uint8Array([UMPPartId.END_OF_TRACK, 0])])).toEqual({
      endOfTrack: true,
      partial: false,
      partTypes: [UMPPartId.END_OF_TRACK],
    })
  })

  it('recognizes a truncated part', () => {
    expect(inspectUmpChunks([new Uint8Array([UMPPartId.MEDIA, 2, 1])])).toMatchObject({
      endOfTrack: false,
      partial: true,
      partTypes: [],
    })
  })

  it('preserves UMP parts across every network split', () => {
    const media = part(UMPPartId.MEDIA, Array.from({ length: 130 }, (_, index) => index))
    const end = part(UMPPartId.MEDIA_END, [1])
    const envelope = new Uint8Array(media.byteLength + end.byteLength)
    envelope.set(media)
    envelope.set(end, media.byteLength)

    for (let split = 1; split < envelope.byteLength; split += 1) {
      const framer = createUmpFramer()
      const frames = [
        ...framer.push(envelope.slice(0, split)),
        ...framer.push(envelope.slice(split)),
      ]
      expect(frames.map((frame) => frame.type), `split at byte ${split}`).toEqual([
        UMPPartId.MEDIA,
        UMPPartId.MEDIA_END,
      ])
      expect(framer.partial, `split at byte ${split}`).toBe(false)
    }
  })
})

describe('createUmpSegmentCollector', () => {
  it('harvests interleaved audio and video across every network split', () => {
    const audioHeader = MediaHeader.encode({
      headerId: 1,
      itag: 251,
      startMs: '0',
      durationMs: '5000',
      contentLength: '3',
    }).finish()
    const videoHeader = MediaHeader.encode({
      headerId: 2,
      itag: 399,
      startMs: '0',
      durationMs: '5005',
      contentLength: '3',
    }).finish()
    const envelope = join([
      part(UMPPartId.MEDIA_HEADER, audioHeader),
      part(UMPPartId.MEDIA_HEADER, videoHeader),
      part(UMPPartId.MEDIA, [1, 10, 11]),
      part(UMPPartId.MEDIA, [2, 20]),
      part(UMPPartId.MEDIA, [1, 12]),
      part(UMPPartId.MEDIA_END, [1]),
      part(UMPPartId.MEDIA, [2, 21, 22]),
      part(UMPPartId.MEDIA_END, [2]),
    ])

    for (let split = 1; split < envelope.byteLength; split += 1) {
      const framer = createUmpFramer()
      const collector = createUmpSegmentCollector()
      const segments = [
        ...framer.push(envelope.slice(0, split)),
        ...framer.push(envelope.slice(split)),
      ].flatMap((frame) => collector.push(frame) ?? [])

      expect(segments.map((segment) => ({
        key: segment.formatKey,
        data: [...segment.data],
      })), `split at byte ${split}`).toEqual([
        { key: '251:', data: [10, 11, 12] },
        { key: '399:', data: [20, 21, 22] },
      ])
    }
  })

  it('rejects a segment whose declared content is incomplete', () => {
    const framer = createUmpFramer()
    const collector = createUmpSegmentCollector()
    const envelope = join([
      part(UMPPartId.MEDIA_HEADER, MediaHeader.encode({
        headerId: 1,
        itag: 251,
        contentLength: '3',
      }).finish()),
      part(UMPPartId.MEDIA, [1, 10, 11]),
      part(UMPPartId.MEDIA_END, [1]),
    ])

    expect(framer.push(envelope).flatMap((frame) => collector.push(frame) ?? [])).toEqual([])
  })
})

describe('a SABR session answered with no media', () => {
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
    endScreen: [],
    clientInfo: { clientName: 1, clientVersion: '2.20261008.00.00' },
    mint: async () => 'AAAA',
    recoverMint,
  }
  const seek: SegmentRequest = {
    requestId: 'request-1',
    sessionId: 'session-1',
    generation: 1,
    track: 'video',
    kind: 'media',
    startTimeMs: 90_000,
    snapshot: { currentTimeMs: 90_000, playbackRate: 1, bandwidthEstimate: 10_000_000, viewportWidth: 1_280, viewportHeight: 720 },
  }
  const init: SegmentRequest = { ...seek, kind: 'init', range: { start: 0, end: 700 } }

  const answerWithStatus = (status: number) => vi.mocked(egressFetch).mockImplementation(async () =>
    new Response(part(UMPPartId.STREAM_PROTECTION_STATUS, StreamProtectionStatus.encode({ status }).finish())))

  // a request through every retry and its waits
  const failure = async (session: ReturnType<typeof createSabrSession>, request = seek) => {
    const outcome = session.requestSegment(request).then(() => 'played', (error: Error) => error.message)
    await vi.runAllTimersAsync()
    return outcome
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    vi.stubGlobal('MediaSource', { isTypeSupported: () => true })
    recoverMint.mockClear()
    vi.mocked(egressFetch).mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it.each([
    ['a seek', seek, seek],
    ['an init', init, init],
    ['an init, then a seek', init, seek],
  ])('replaces the BotGuard session on status 2 once per stream, not on every attempt: %s', async (_, first, then) => {
    answerWithStatus(2)
    const session = createSabrSession(source)
    expect(await failure(session, first)).toBe('youtube: SABR stream status 2 after 3 attempts')
    expect(recoverMint).toHaveBeenCalledTimes(1)
    expect(await failure(session, then)).toBe('youtube: SABR stream status 2 after 3 attempts')
    expect(recoverMint).toHaveBeenCalledTimes(1)
    expect(egressFetch).toHaveBeenCalledTimes(6)
    session.close()
    const next = createSabrSession(source)
    await failure(next, first)
    expect(recoverMint).toHaveBeenCalledTimes(2)
    next.close()
  })

  it('replaces it on status 3 before every retry', async () => {
    answerWithStatus(3)
    const session = createSabrSession(source)
    expect(await failure(session)).toBe('youtube: SABR stream status 3 after 3 attempts')
    expect(recoverMint).toHaveBeenCalledTimes(2)
    await failure(session)
    expect(recoverMint).toHaveBeenCalledTimes(4)
    session.close()
  })
})
