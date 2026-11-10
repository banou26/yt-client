import type { createSabrSession } from './sabr'

export type LiveOpenSession = Pick<ReturnType<typeof createSabrSession>, 'requestSegment' | 'startLivePump' | 'liveSegments' | 'videoFormat' | 'close'>

/** The position a live session's opening request asks at: the stream's head, as youtube.com's live player asks first. */
export const LIVE_HEAD_MS = Number.MAX_SAFE_INTEGER

const LIVE_START_TIMEOUT_MS = 3_000

/** Asks a live session for its stream at the head, starts its pump and returns the manifest `manifestFor` builds as
    soon as a segment is in, or after 3 s if none is. When the open fails it closes the session, which stops the pump,
    and rethrows: the caller never stored it.

    The first segment is enough to start on, as it is for youtube.com: the server answers the head with the segment two
    behind it, so the ones between already exist and the pump brings them in faster than they play (measured
    2026-11-11, where waiting for four first cost about 2.5 s of a 5 s preview). */
export const openLiveManifest = async (
  player: LiveOpenSession,
  { sessionId, videoId, manifestFor }: { sessionId: string, videoId: string, manifestFor: () => string | undefined },
) => {
  try {
    await player.requestSegment({
      requestId: `${sessionId}:live-open`,
      sessionId,
      generation: 0,
      track: 'video',
      kind: 'media',
      formatKey: player.videoFormat.key,
      startTimeMs: LIVE_HEAD_MS,
      snapshot: { currentTimeMs: 0, playbackRate: 1, bandwidthEstimate: 10_000_000, viewportWidth: 1_280, viewportHeight: 720 },
    }, () => {})
    player.startLivePump()
    const deadline = Date.now() + LIVE_START_TIMEOUT_MS
    while (player.liveSegments.length === 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    const manifest = manifestFor()
    if (!manifest) throw new Error(`youtube: live stream ${videoId} delivered no addressable segment`)
    return manifest
  } catch (error) {
    player.close()
    throw error
  }
}
