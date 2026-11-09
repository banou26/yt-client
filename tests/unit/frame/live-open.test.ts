import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import type { LiveOpenSession } from '../../../src/frame/live-open'
import { openLiveManifest } from '../../../src/frame/live-open'

// a SABR session whose pump asks YouTube for the next segment every second, from startLivePump until close
const fakeLiveSession = (probe: () => Promise<void> = async () => {}) => {
  let pump: ReturnType<typeof setInterval> | undefined
  const fake = {
    polls: 0,
    requestSegment: vi.fn(async () => {
      await probe()
      return { end: true }
    }),
    startLivePump: vi.fn(() => {
      pump ??= setInterval(() => { fake.polls++ }, 1_000)
    }),
    liveSegments: [],
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

  it('closes the session when the live probe fails, and rethrows its error', async () => {
    const fake = fakeLiveSession(async () => {
      throw new Error('youtube: probe answered no media')
    })
    await expect(open(fake, () => '<MPD/>')).rejects.toThrow('youtube: probe answered no media')
    expect(fake.close).toHaveBeenCalledOnce()
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
