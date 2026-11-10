import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import {
  endSleepTimer,
  getSleepTimer,
  setSleepTimer,
  sleepDetail,
  sleepDuration,
  subscribeSleepTimer,
} from '../../../src/player/sleep-timer'

const MINUTE = 60_000

const watch = () => {
  const events: boolean[] = []
  const stop = subscribeSleepTimer(ended => events.push(ended))
  return { ends: () => events.filter(Boolean).length, stop }
}

describe('the sleep timer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-10T00:00:00Z'))
  })

  afterEach(() => {
    setSleepTimer(undefined)
    vi.useRealTimers()
  })

  it('ends once, the picked minutes after it was set', () => {
    const { ends, stop } = watch()
    setSleepTimer(10)
    expect(getSleepTimer()).toEqual({ minutes: 10, endsAt: Date.now() + 10 * MINUTE })
    vi.advanceTimersByTime(10 * MINUTE - 1)
    expect(ends()).toBe(0)
    vi.advanceTimersByTime(1)
    expect(ends()).toBe(1)
    expect(getSleepTimer()).toBeUndefined()
    vi.advanceTimersByTime(120 * MINUTE)
    expect(ends()).toBe(1)
    stop()
  })

  it('starts over from the new pick when another is made', () => {
    const { ends, stop } = watch()
    setSleepTimer(10)
    vi.advanceTimersByTime(5 * MINUTE)
    setSleepTimer(15)
    vi.advanceTimersByTime(10 * MINUTE)
    expect(ends()).toBe(0)
    vi.advanceTimersByTime(5 * MINUTE)
    expect(ends()).toBe(1)
    stop()
  })

  it('never ends once turned off', () => {
    const { ends, stop } = watch()
    setSleepTimer(30)
    vi.advanceTimersByTime(29 * MINUTE)
    setSleepTimer(undefined)
    vi.advanceTimersByTime(120 * MINUTE)
    expect(ends()).toBe(0)
    expect(getSleepTimer()).toBeUndefined()
    stop()
  })

  it('waits for the player to end it at the end of the video, and leaves no alarm behind', () => {
    const { ends, stop } = watch()
    setSleepTimer(10)
    setSleepTimer('end')
    vi.advanceTimersByTime(24 * 60 * MINUTE)
    expect(ends()).toBe(0)
    expect(getSleepTimer()).toBe('end')
    endSleepTimer()
    expect(ends()).toBe(1)
    expect(getSleepTimer()).toBeUndefined()
    stop()
  })

  it('counts down in the settings row', () => {
    expect(sleepDetail(undefined, 200)).toBe('Off')
    setSleepTimer(10)
    expect(sleepDetail(getSleepTimer(), 200)).toBe('10 min left')
    vi.advanceTimersByTime(5 * MINUTE)
    expect(sleepDetail(getSleepTimer(), 200)).toBe('5 min left')
    vi.advanceTimersByTime(4 * MINUTE + 35_000)
    expect(sleepDetail(getSleepTimer(), 200)).toBe('1 min left')
    setSleepTimer(60)
    expect(sleepDetail(getSleepTimer(), 200)).toBe('1 hr left')
    setSleepTimer('end')
    expect(sleepDetail(getSleepTimer(), 198)).toBe('4 min left')
  })
})

describe('the time left', () => {
  it('reads as youtube.com writes it, rounded up to the minute', () => {
    expect(sleepDuration(198)).toBe('4 min')
    expect(sleepDuration(25)).toBe('1 min')
    expect(sleepDuration(0)).toBe('1 min')
    expect(sleepDuration(3_600)).toBe('1 hr')
    expect(sleepDuration(8_196)).toBe('2 hr 17 min')
  })
})
