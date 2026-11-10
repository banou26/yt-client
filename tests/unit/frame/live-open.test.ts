import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import type { LiveOpenSession } from '../../../src/frame/live-open'
import { openLiveManifest } from '../../../src/frame/live-open'
import { LIVE_HEAD_MS } from '../../../src/frame/sabr'

// a SABR session whose pump asks YouTube for the next segment every second, from startLivePump until close
const fakeLiveSession = (opening: () => Promise<void> = async () => {}) => {
  let pump: ReturnType<typeof setInterval> | undefined
  const fake = {
    polls: 0,
    requestSegment: vi.fn(async () => {
      await opening()
      return { end: true }
    }),
    startLivePump: vi.fn(() => {
      pump ??= setInterval(() => { fake.polls++ }, 1_000)
    }),
    liveSegments: [] as { sequenceNumber: number, startMs: number, durationMs: number }[],
    videoFormat: { key: '134:' },
    close: vi.fn(() => {
      clearInterval(pump)
      pump = undefined
    }),
  }
  return fake
}

const open = (fake: ReturnType<typeof fakeLiveSession>, manifestFor: () => string | undefined) =>
  openLiveManifest(fake as unknown as LiveOpenSession, { sessionId: 'playback:1', videoId: 'live-1', manifestFor })

describe('opening a live playback', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('closes the session, which stops its pump, when the pump delivers no addressable segment', async () => {
    const fake = fakeLiveSession()
    const failed = expect(open(fake, () => undefined)).rejects.toThrow('youtube: live stream live-1 delivered no addressable segment')
    await vi.advanceTimersByTimeAsync(3_000)
    await failed
    expect(fake.startLivePump).toHaveBeenCalledOnce()
    expect(fake.polls).toBeGreaterThan(0)
    expect(fake.close).toHaveBeenCalledOnce()
    const polls = fake.polls
    await vi.advanceTimersByTimeAsync(10_000)
    expect(fake.polls).toBe(polls)
  })

  it('closes the session when its opening request fails, and rethrows its error', async () => {
    const fake = fakeLiveSession(async () => {
      throw new Error('youtube: opening answered no media')
    })
    await expect(open(fake, () => '<MPD/>')).rejects.toThrow('youtube: opening answered no media')
    expect(fake.close).toHaveBeenCalledOnce()
  })

  it('asks at the head and returns the manifest as soon as the answer brings a segment', async () => {
    const fake = fakeLiveSession(async () => {
      fake.liveSegments.push({ sequenceNumber: 7, startMs: 35_000, durationMs: 5_000 })
    })
    let manifest: string | undefined
    void open(fake, () => '<MPD/>').then((value) => { manifest = value })
    await vi.advanceTimersByTimeAsync(0)
    expect(fake.requestSegment).toHaveBeenCalledWith(expect.objectContaining({ startTimeMs: LIVE_HEAD_MS }), expect.any(Function))
    expect(manifest, 'the open waited for more than the first segment').toBe('<MPD/>')
  })

  it('leaves the session and its pump running when the open gets a manifest', async () => {
    const fake = fakeLiveSession()
    const opened = expect(open(fake, () => '<MPD/>')).resolves.toBe('<MPD/>')
    await vi.advanceTimersByTimeAsync(3_000)
    await opened
    expect(fake.close).not.toHaveBeenCalled()
    const polls = fake.polls
    await vi.advanceTimersByTimeAsync(2_000)
    expect(fake.polls).toBeGreaterThan(polls)
  })
})
