import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import type { ReplayLine, ReplayPage } from '../../../src/components/chat-replay-follow'

import { followChatReplay } from '../../../src/components/chat-replay-follow'

// paused at 0:10, so only the answers move the replay
const follow = (answers: (ReplayPage<ReplayLine> | undefined)[]) => {
  const asked: number[] = []
  const shown: string[][] = []
  const started = Date.now()
  const stop = followChatReplay({
    playhead: () => 10,
    fetchPage: async () => {
      asked.push(Date.now() - started)
      return answers.shift()
    },
    show: (lines) => shown.push(lines.map((line) => line.id)),
    onRestart: () => {},
    limit: 250,
  })
  return { asked, shown, stop }
}

describe('followChatReplay', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('asks again from 500 ms doubling to 8 s while the replay cannot be read, and from 500 ms after a page', async () => {
    const { asked, stop } = follow([undefined, undefined, undefined, undefined, undefined, undefined])
    await vi.advanceTimersByTimeAsync(30_000)
    expect(asked).toEqual([0, 500, 1_500, 3_500, 7_500, 15_500, 23_500])
    stop()

    const line = { id: 'line-1', offsetMs: 9_000 }
    const after = follow([undefined, undefined, { items: [line], cursor: 'next' }, undefined, undefined])
    await vi.advanceTimersByTimeAsync(5_000)
    // the page names a next one the playhead is already near, so it is asked on the next tick
    expect(after.asked).toEqual([0, 500, 1_500, 1_750, 2_250, 3_250])
    expect(after.shown.at(-1)).toEqual(['line-1'])
    after.stop()
  })

  it('asks again 2 s after a page that brought nothing new', async () => {
    const empty = { items: [], cursor: 'next' }
    const { asked, stop } = follow([empty, empty, empty, empty])
    await vi.advanceTimersByTimeAsync(6_100)
    expect(asked).toEqual([0, 2_000, 4_000, 6_000])
    stop()
  })
})
