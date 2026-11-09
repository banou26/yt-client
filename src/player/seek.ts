// keyed BY VIDEO ID rather than held as one handle: the watch page remounts its player on every queue navigation and retry, and an unkeyed handle would let a seek land on a player already torn down
type SeekHandler = (seconds: number, play: boolean) => void
type PlayheadReader = () => number

let current: { videoId: string, seek: SeekHandler, playhead: PlayheadReader } | undefined

export const registerSeek = (videoId: string, seek: SeekHandler, playhead: PlayheadReader) => {
  current = { videoId, seek, playhead }
}

/**
 * Where the mounted video is, in seconds with their fraction, for the chat replay.
 *
 * Undefined rather than 0 when the video is not the one mounted: 0 is a real
 * position, and a caller cannot tell a genuine start-of-video from "no player"
 * if both answer the same.
 */
export const playheadAt = (videoId: string) => {
  if (current?.videoId !== videoId) return undefined
  const seconds = current.playhead()
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined
}

/** {@link playheadAt} in whole seconds, for the share dialog's "start at" offset. */
export const playheadOf = (videoId: string) => {
  const seconds = playheadAt(videoId)
  return seconds === undefined ? undefined : Math.floor(seconds)
}

// takes the id it is releasing so a teardown that arrives AFTER the next player has registered cannot clear the live handle
export const clearSeek = (videoId: string) => {
  if (current?.videoId === videoId) current = undefined
}

/**
 * Seeks the video currently mounted, if it is the one being addressed.
 *
 * Returns whether the seek was taken, so a caller can fall back to a plain
 * link: a timestamp in a comment can point at a DIFFERENT video, and that has
 * to navigate rather than silently do nothing. It starts a paused video unless
 * `play` is false, as a transcript line on youtube.com leaves it paused.
 */
export const seekTo = (videoId: string, seconds: number, play = true) => {
  if (current?.videoId !== videoId || !Number.isFinite(seconds) || seconds < 0) return false
  current.seek(seconds, play)
  return true
}
