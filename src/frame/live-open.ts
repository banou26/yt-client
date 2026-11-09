import type { createSabrSession } from './sabr'

export type LiveOpenSession = Pick<ReturnType<typeof createSabrSession>, 'requestSegment' | 'startLivePump' | 'liveSegments' | 'videoFormat' | 'close'>

const LIVE_START_DEPTH = 4
const LIVE_START_DEPTH_TIMEOUT_MS = 3_000

/** Probes a live session, starts its pump and returns the manifest `manifestFor` builds once a few segments are in, or
    after 3 s if they are not. When the open fails it closes the session, which stops the pump, and rethrows: the caller
    never stored it. */
export const openLiveManifest = async (
  player: LiveOpenSession,
  { sessionId, videoId, manifestFor }: { sessionId: string, videoId: string, manifestFor: () => string | undefined },
) => {
  try {
    await player.requestSegment({
      requestId: `${sessionId}:live-probe`,
      sessionId,
      generation: 0,
      track: 'video',
      kind: 'media',
      formatKey: player.videoFormat.key,
      startTimeMs: 0,
      snapshot: { currentTimeMs: 0, playbackRate: 1, bandwidthEstimate: 10_000_000, viewportWidth: 1_280, viewportHeight: 720 },
    }, () => {})
    player.startLivePump()
    const depthDeadline = Date.now() + LIVE_START_DEPTH_TIMEOUT_MS
    while (player.liveSegments.length < LIVE_START_DEPTH && Date.now() < depthDeadline) {
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
