/** A video the player can move on to, with the queue it belongs to when it is a playlist entry. */
export type UpNext = {
  id: string
  title?: string | null
  thumbnail?: string | null
  channel?: { name: string } | null
  list?: string
  /** 0-based, like the schema's `playlistIndex`. */
  index?: number
}

/** youtube.com's own countdown, the `countDownSecs` its /next answer carries. */
export const COUNTDOWN_SECONDS = 5

/**
 * The playlist queue's loop and shuffle, shared by the queue panel's buttons
 * and the player's end of video. Module scope because the panel unmounts on
 * every queue navigation, and kept out of settings.ts because a queue mode
 * belongs to the session in progress, not to the next one.
 */
export const queueMode = { loop: false, shuffle: false }

// under shuffle the offset is drawn from a range one shorter than the queue and stepped over the current position, so the video on screen is never picked again
export const nextQueueIndex = (
  current: number,
  count: number,
  mode: { loop: boolean, shuffle: boolean } = queueMode,
  random = Math.random,
) => {
  if (mode.shuffle) {
    if (count < 2) return undefined
    const offset = Math.floor(random() * (count - 1))
    return offset >= current ? offset + 1 : offset
  }
  if (current + 1 < count) return current + 1
  return mode.loop && count > 1 ? 0 : undefined
}

export const hasNextInQueue = (current: number, count: number, mode: { loop: boolean, shuffle: boolean } = queueMode) =>
  mode.shuffle ? count > 1 : current + 1 < count || (mode.loop && count > 1)

// previous steps back through the list even under shuffle: going back to what actually played would need a play history
export const previousQueueIndex = (current: number, count: number, mode: { loop: boolean } = queueMode) =>
  current > 0 ? current - 1 : mode.loop && count > 1 ? count - 1 : undefined

const RECENT_LIMIT = 50
const recent = new Set<string>()

/** Remembers a video as played in this tab, so autoplay does not bounce between two videos that list each other first. */
export const markPlayed = (id: string) => {
  recent.delete(id)
  recent.add(id)
  if (recent.size > RECENT_LIMIT) recent.delete(recent.values().next().value!)
}

/** The autoplay pick: the first related video not played yet in this tab, else the first that is not the current one. */
export const pickAutoplay = <Video extends { id: string }>(
  related: readonly Video[],
  currentId: string,
  played: ReadonlySet<string> = recent,
) =>
  related.find(video => video.id !== currentId && !played.has(video.id))
    ?? related.find(video => video.id !== currentId)

/**
 * What the end of a video does: a following queue entry starts at once, the
 * autoplay pick gets youtube.com's countdown, and otherwise, with Autoplay off
 * or the countdown cancelled, the end screen offers suggestions.
 */
export const endAction = (
  { queued, autoplay, pick, cancelled }: { queued: boolean, autoplay: boolean, pick?: UpNext, cancelled: boolean },
): 'advance' | 'countdown' | 'suggestions' =>
  queued ? 'advance' : autoplay && pick && !cancelled ? 'countdown' : 'suggestions'
