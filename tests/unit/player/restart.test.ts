import { describe, expect, it } from 'vite-plus/test'

import { createRestartBudget, resetsEngine } from '../../../src/player/restart'

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
