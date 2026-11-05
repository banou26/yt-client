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
