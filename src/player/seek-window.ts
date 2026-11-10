import type shaka from 'shaka-player'

/** Where the playhead can go: a video's whole length, or a live stream's DVR window up to the edge it plays at. */
export type SeekWindow = { start: number, end: number }

// youtube.com still counts a playhead one 5 s step behind the head as live, and not one two steps behind (measured 2026-11-11)
const LIVE_EDGE_SLACK = 8

/** A live stream's window is Shaka's seek range, whose end is the edge Shaka opens the stream at; a video's is 0 to its duration. */
export const seekWindow = (video: HTMLVideoElement, player: shaka.Player | undefined): SeekWindow =>
  player?.isLive()
    ? player.seekRange()
    : { start: 0, end: Number.isFinite(video.duration) ? video.duration : 0 }

export const clampToWindow = ({ start, end }: SeekWindow, time: number) => Math.max(start, Math.min(end, time))

/** The time a share of the way through the window, as a number key seeks. */
export const timeAtShare = ({ start, end }: SeekWindow, share: number) => start + (end - start) * share

/** Whether a live playhead is at the edge, as youtube.com's Live badge tells it apart from one behind. */
export const atLiveEdge = ({ end }: SeekWindow, time: number) => end - time < LIVE_EDGE_SLACK

/** Where a live stream reopens after a restart: 0, the edge, when it played at the edge, or the time it played at. */
export const liveResumeTime = (window: SeekWindow, time: number) => (atLiveEdge(window, time) ? 0 : time)
