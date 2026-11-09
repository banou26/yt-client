import { useEffect, useState } from 'preact/hooks'

import { getSettings, subscribeSettings } from '../settings'

/** A sponsor part of a video, in seconds from its start. */
export type SkipSegment = { start: number, end: number }

/** SponsorBlock's home page, which every place that credits it links. */
export const SPONSORBLOCK_URL = 'https://sponsor.ajay.app'

const SKIP_SEGMENTS = 'https://sponsor.ajay.app/api/skipSegments/'

const NONE: readonly SkipSegment[] = []

/**
 * How far below the time it was set to a media element's clock can read back: Chrome keeps whole microseconds, so a
 * seek to 8.123456789 reads 8.123456 during its `seeking` event.
 */
export const CLOCK_SLACK = 0.001

/**
 * The first 4 hex characters of the SHA-256 of a video id. SponsorBlock answers a prefix with every video under it,
 * so it is asked for the prefix and never learns the id.
 */
export const hashPrefix = async (videoId: string) => {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(videoId)))
  return Array.from(digest.subarray(0, 2), byte => byte.toString(16).padStart(2, '0')).join('')
}

/** The video's sponsor parts in SponsorBlock's answer for its prefix, sorted by start. Anything else is dropped. */
export const parseSegments = (answer: unknown, videoId: string): SkipSegment[] => {
  if (!Array.isArray(answer)) return []
  const video = (answer as ({ videoID?: unknown, segments?: unknown } | null)[]).find(item => item?.videoID === videoId)
  if (!Array.isArray(video?.segments)) return []
  return (video.segments as ({ category?: unknown, actionType?: unknown, segment?: unknown } | null)[])
    .flatMap((item) => {
      if (item?.category !== 'sponsor' || item.actionType !== 'skip' || !Array.isArray(item.segment)) return []
      const [start, end] = item.segment as unknown[]
      return typeof start === 'number' && typeof end === 'number' && start >= 0 && end > start && Number.isFinite(end)
        ? [{ start, end }]
        : []
    })
    .sort((a, b) => a.start - b.start)
}

/**
 * Where playback at `time` jumps to: the end of the part it is in, carried on through every part that touches or
 * overlaps it, or undefined when it is in none. A time within CLOCK_SLACK of a part's end is past it. An excused part
 * is played. `segments` are sorted by start.
 */
export const skipTarget = (segments: readonly SkipSegment[], time: number, excused: ReadonlySet<SkipSegment>) => {
  let target: number | undefined
  for (const segment of segments) {
    const at = target ?? time
    if (segment.start <= at && at < segment.end - CLOCK_SLACK && !excused.has(segment)) target = segment.end
  }
  return target
}

/**
 * The video's sponsor parts while Skip sponsors is on, asked of SponsorBlock straight from the browser. Empty until
 * they arrive, without an id, and on any failure, so nothing waits on them.
 */
export const useSponsorSegments = (videoId: string | undefined) => {
  const [enabled, setEnabled] = useState(() => getSettings().skipSponsors)
  const [segments, setSegments] = useState(NONE)
  useEffect(() => subscribeSettings(settings => setEnabled(settings.skipSponsors)), [])

  useEffect(() => {
    setSegments(NONE)
    if (!videoId || !enabled) return
    const abort = new AbortController()
    void (async () => {
      const prefix = await hashPrefix(videoId)
      const response = await fetch(`${SKIP_SEGMENTS}${prefix}?categories=["sponsor"]&actionTypes=["skip"]`, { signal: abort.signal })
      // a prefix with no sponsor part answers 404 with [], read like any other answer
      const found = parseSegments(await response.json(), videoId)
      if (!abort.signal.aborted) setSegments(found)
    })().catch(() => {})
    return () => abort.abort()
  }, [videoId, enabled])

  return segments
}
