/**
 * Whether a playback failure also replaces the engine. A live session's own errors do not: the frame's live session
 * recovers them, and an engine reset also drops the live chat polling beside the player.
 */
export const resetsEngine = (error: unknown) =>
  error instanceof Error && error.message.startsWith('youtube:') && !error.message.startsWith('youtube: live ')

/**
 * How many playback restarts in a row a video gets before it shows its error. A stretch of real play in between
 * starts the count again, so a few hiccups over hours of a live stream are not fatal.
 */
export const createRestartBudget = (limit = 3, settleSeconds = 30) => {
  let used = 0
  let played = 0
  let last: number | undefined
  return {
    get used() { return used },
    // false once the limit is spent
    spend: () => {
      used += 1
      played = 0
      last = undefined
      return used <= limit
    },
    // a step of 1.5 s or more is a seek or a jump over missing media, not play
    progress: (time: number) => {
      const step = last === undefined ? 0 : time - last
      last = time
      if (step <= 0 || step >= 1.5) return
      played += step
      if (played >= settleSeconds) used = 0
    },
  }
}

/**
 * Whether a clock that should be moving has stood still for `limitMs`. Shaka only asks for the segments its live
 * manifest lists, so a session that stops delivering leaves it buffering for good with no error of its own. Time while
 * not `playing` (paused, ended, hidden) does not count, and it fires once per stretch of `limitMs`.
 */
export const createStallWatch = (limitMs = 30_000) => {
  let last: number | undefined
  let since = 0
  return (time: number, playing: boolean, now: number) => {
    if (!playing || time !== last) {
      last = time
      since = now
      return false
    }
    if (now - since < limitMs) return false
    since = now
    return true
  }
}
