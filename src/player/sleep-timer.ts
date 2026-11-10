import { useEffect, useRef, useState } from 'preact/hooks'

/** youtube.com's Sleep timer choices in minutes, before its End of video (measured 2026-11-10). */
export const SLEEP_MINUTES = [10, 15, 20, 30, 45, 60]

/** A running timer: minutes of wall-clock time from when it was set, or the end of the video playing. */
export type SleepTimer = { minutes: number, endsAt: number } | 'end'

let timer: SleepTimer | undefined
let alarm: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<(ended: boolean) => void>()

const emit = (ended: boolean) => {
  for (const listener of listeners) listener(ended)
}

export const getSleepTimer = () => timer

/**
 * Starts, replaces or turns off the sleep timer. Module scope because, as on youtube.com, the timer carries over to
 * the next video, and minutes count whether the video plays or not.
 */
export const setSleepTimer = (choice: number | 'end' | undefined) => {
  clearTimeout(alarm)
  alarm = undefined
  if (typeof choice === 'number') {
    timer = { minutes: choice, endsAt: Date.now() + choice * 60_000 }
    alarm = setTimeout(endSleepTimer, choice * 60_000)
  } else {
    timer = choice
  }
  emit(false)
}

/** Ends the timer now, which pauses the player: the alarm calls it, and the player does at the end of the video for End of video. */
export const endSleepTimer = () => {
  clearTimeout(alarm)
  alarm = undefined
  timer = undefined
  emit(true)
}

/** Calls `listener` on every change, with `true` when the timer ended rather than was set. */
export const subscribeSleepTimer = (listener: (ended: boolean) => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The timer, kept current; `onEnd` runs when it ends. */
export const useSleepTimer = (onEnd: () => void) => {
  const [current, setCurrent] = useState(getSleepTimer)
  const latest = useRef(onEnd)
  latest.current = onEnd
  useEffect(() => subscribeSleepTimer((ended) => {
    setCurrent(getSleepTimer())
    if (ended) latest.current()
  }), [])
  return current
}

/** youtube.com's time left, rounded up to the minute: 10 min, 1 hr, 2 hr 17 min. */
export const sleepDuration = (seconds: number) => {
  const minutes = Math.max(1, Math.ceil(seconds / 60))
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return [hours > 0 ? `${hours} hr` : '', rest > 0 ? `${rest} min` : ''].filter(Boolean).join(' ')
}

/** The settings row's detail: Off, or the time left, which for End of video is the video's own. */
export const sleepDetail = (current: SleepTimer | undefined, videoLeft: number, now = Date.now()) =>
  current === undefined
    ? 'Off'
    : `${sleepDuration(current === 'end' ? videoLeft : (current.endsAt - now) / 1_000)} left`
