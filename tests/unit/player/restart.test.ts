import { describe, expect, it } from 'vite-plus/test'

import { STREAM_REFUSED } from '../../../src/frame/protocol'
import { createRestartBudget, createStallWatch, isStreamRefusal, resetsEngine } from '../../../src/player/restart'

describe('resetsEngine', () => {
  it('keeps the engine, and the live chat in it, for a live session\'s own errors', () => {
    expect(resetsEngine(new Error('youtube: live segment 1348870 was not delivered'))).toBe(false)
    expect(resetsEngine(new Error('youtube: live segment 1348872 is older than the session window'))).toBe(false)
    expect(resetsEngine(new Error('youtube: live session playback:2 has no delivered segments'))).toBe(false)
  })

  it('still replaces it for other source errors, and not for its own faults, which replace it already', () => {
    expect(resetsEngine(new Error('youtube: SABR stream status 2 after 3 attempts'))).toBe(true)
    expect(resetsEngine(new Error('yt-client: requestSegment timed out after 20s of inactivity'))).toBe(false)
  })
})

describe('createRestartBudget', () => {
  it('allows three restarts in a row, then gives up', () => {
    const restarts = createRestartBudget()
    expect([restarts.spend(), restarts.spend(), restarts.spend(), restarts.spend()]).toEqual([true, true, true, false])
  })

  it('starts the count again after 30 s of real play', () => {
    const restarts = createRestartBudget()
    restarts.spend()
    restarts.spend()
    restarts.spend()
    for (let time = 0; time <= 30; time += 0.25) restarts.progress(1_000 + time)
    expect(restarts.used).toBe(0)
    expect([restarts.spend(), restarts.spend(), restarts.spend(), restarts.spend()]).toEqual([true, true, true, false])
  })

  it('does not count jumps over missing media or a stopped clock as play', () => {
    const restarts = createRestartBudget()
    restarts.spend()
    restarts.spend()
    restarts.spend()
    for (let time = 0; time <= 60; time += 5) restarts.progress(time)
    for (let tick = 0; tick < 100; tick += 1) restarts.progress(60)
    expect(restarts.spend()).toBe(false)
  })
})

describe('a refused playback', () => {
  it('is told apart from the errors a restart can fix', () => {
    expect(isStreamRefusal(new Error(`${STREAM_REFUSED} (SABR stream status 2 after 3 attempts)`))).toBe(true)
    expect(isStreamRefusal(new Error('youtube: SABR stream status 2 after 3 attempts'))).toBe(false)
    expect(isStreamRefusal(`${STREAM_REFUSED} (segment returned 403)`)).toBe(false)
  })

  it('waits 5, 15 and 45 s before its next tries, then has no wait left, apart from the restart count', () => {
    const restarts = createRestartBudget()
    expect([restarts.refused(), restarts.refused(), restarts.refused(), restarts.refused()]).toEqual([5_000, 15_000, 45_000, undefined])
    expect(restarts.spend()).toBe(true)
  })

  it('starts the waits again after 30 s of real play, or when the viewer asks to retry', () => {
    const restarts = createRestartBudget()
    for (let tries = 0; tries < 4; tries += 1) restarts.refused()
    for (let time = 0; time <= 30; time += 0.25) restarts.progress(time)
    expect(restarts.refused()).toBe(5_000)
    for (let tries = 0; tries < 3; tries += 1) restarts.refused()
    restarts.reset()
    expect(restarts.refused()).toBe(5_000)
  })
})

describe('createStallWatch', () => {
  // one sample a second, as the player takes them
  const run = (watch: ReturnType<typeof createStallWatch>, seconds: number, at: (second: number) => { time: number, playing?: boolean }, from = 0) => {
    const fired: number[] = []
    for (let second = from; second < from + seconds; second += 1) {
      const { time, playing = true } = at(second)
      if (watch(time, playing, second * 1_000)) fired.push(second)
    }
    return fired
  }

  it('fires once a playing clock has stood still for 30 s, and again only after 30 s more', () => {
    const watch = createStallWatch()
    expect(run(watch, 20, (second) => ({ time: second }))).toEqual([])
    expect(run(watch, 70, () => ({ time: 19 }), 20)).toEqual([49, 79])
  })

  it('never fires while the clock moves, whatever it jumps by', () => {
    const watch = createStallWatch()
    expect(run(watch, 120, (second) => ({ time: second % 2 ? second * 3 : second }))).toEqual([])
  })

  it('does not count time while the video is paused, ended or hidden', () => {
    const watch = createStallWatch()
    expect(run(watch, 100, () => ({ time: 5, playing: false }))).toEqual([])
    expect(run(watch, 40, () => ({ time: 5 }), 100)).toEqual([129])
  })
})
