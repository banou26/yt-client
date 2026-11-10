import type { PlaybackFormat } from './protocol'

import { codecsOf } from './protocol'

/* segments are addressed by SEQUENCE, not by byte range, and sequence maps onto time on a fixed grid (rFZHOHl-L8A,
   measured 2026-11-11: startMs = sequence * 5000 - 16867, within 15 ms). The timeline ends with segments that have
   ALREADY ARRIVED, at the times their media headers give, and the server's DVR window before them is laid on that grid. */

const seconds = (value: number) => `PT${(value / 1_000).toFixed(3)}S`

const escapeAttribute = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

const containerOf = (mimeType: string) => mimeType.split(';')[0] ?? 'video/mp4'

export type LiveSegment = {
  sequenceNumber: number
  startMs: number
  durationMs: number
}

// `$Number$` must equal the SABR sequence number, and under a SegmentTimeline it is positional (startNumber, then +1 per S entry), so the run has to be consecutive
export const contiguousTail = (segments: LiveSegment[]) => {
  const ordered = [...segments].sort((a, b) => a.sequenceNumber - b.sequenceNumber)
  let start = ordered.length - 1
  while (start > 0 && ordered[start - 1]!.sequenceNumber === ordered[start]!.sequenceNumber - 1) start -= 1
  return ordered.slice(Math.max(0, start))
}

// the timeline's S entries: one per delivered segment, after one repeated entry for the window's earlier segments
type Timeline = { startNumber: number, entries: string }

// the app's request filter adds the session, generation and start time on the way out, and forwards `n` back as the sequence the session must resolve
const segmentTemplate = (format: PlaybackFormat, track: 'audio' | 'video', { startNumber, entries }: Timeline) => {
  const uri = escapeAttribute(`sabr://${track}?key=${encodeURIComponent(format.key)}`)
  return `<SegmentTemplate timescale="1000" startNumber="${startNumber}" `
    + `initialization="${uri}" media="${uri}&amp;n=$Number$">`
    + `<SegmentTimeline>${entries}</SegmentTimeline>`
    + '</SegmentTemplate>'
}

const representation = (format: PlaybackFormat, track: 'audio' | 'video', timeline: Timeline) => {
  const codecs = escapeAttribute(codecsOf(format.mimeType))
  const size = track === 'video' && format.width && format.height
    ? ` width="${format.width}" height="${format.height}"`
    : ''
  const audio = track === 'audio' ? '<AudioChannelConfiguration schemeIdUri="urn:mpeg:dash:23003:3:audio_channel_configuration:2011" value="2"/>' : ''
  return `<Representation id="${escapeAttribute(format.key)}" codecs="${codecs}" bandwidth="${format.bitrate}"${size}>`
    + `${audio}${segmentTemplate(format, track, timeline)}</Representation>`
}

// one AdaptationSet PER CONTAINER, not one per track: DASH does not allow mixing containers inside an AdaptationSet
const adaptationSets = (formats: PlaybackFormat[], track: 'audio' | 'video', timeline: Timeline) => {
  const groups = new Map<string, PlaybackFormat[]>()
  for (const format of formats) {
    const container = containerOf(format.mimeType)
    groups.set(container, [...(groups.get(container) ?? []), format])
  }
  return [...groups].map(([container, group], index) =>
    `<AdaptationSet id="${track}-${index}" contentType="${track}" mimeType="${escapeAttribute(container)}" `
    + 'segmentAlignment="true" startWithSAP="1">'
    + group.map((format) => representation(format, track, timeline)).join('')
    + '</AdaptationSet>').join('')
}

export type LiveManifestInput = {
  videoFormats: PlaybackFormat[]
  audioFormats: PlaybackFormat[]
  targetMs: number
  segments: LiveSegment[]
  nowMs: number
  anchorMs?: number
  // where the server's DVR window starts (LIVE_METADATA), which the timeline reaches back to
  windowStartMs?: number
}

// availabilityStartTime is held FIXED across refreshes and only ever moves EARLIER: later would drop the newest delivered segment out of availability
export const liveAnchor = (previousMs: number | undefined, nowMs: number, endMs: number) =>
  Math.min(previousMs ?? Infinity, nowMs - endMs)

export const timelineEndMs = (segments: LiveSegment[]) => {
  const last = contiguousTail(segments).at(-1)
  return last && last.startMs + last.durationMs
}

/** How many of the window's segments come before the first delivered one, whole segments from the window's start. */
export const earlierSegments = (firstStartMs: number, targetMs: number, windowStartMs: number | undefined) =>
  windowStartMs === undefined ? 0 : Math.max(0, Math.floor((firstStartMs - windowStartMs) / targetMs))

export const buildLiveManifest = (
  { videoFormats, audioFormats, targetMs, segments, nowMs, anchorMs, windowStartMs }: LiveManifestInput,
) => {
  const delivered = contiguousTail(segments)
  if (!delivered.length) throw new Error('youtube: live manifest needs at least one delivered segment')
  const first = delivered[0]!
  const last = delivered[delivered.length - 1]!
  const endMs = last.startMs + last.durationMs
  const deliveredMs = endMs - first.startMs
  const earlier = earlierSegments(first.startMs, targetMs, windowStartMs)
  const timelineStartMs = first.startMs - earlier * targetMs
  const timeline = {
    startNumber: first.sequenceNumber - earlier,
    entries: (earlier ? `<S t="${timelineStartMs}" d="${targetMs}" r="${earlier - 1}"/>` : '')
      + delivered.map((segment) => `<S t="${segment.startMs}" d="${segment.durationMs}"/>`).join(''),
  }

  // presentation time IS media time: an S entry's `t` is the stream's own clock, which is also the `startMs` the SABR session reports
  const availabilityStart = new Date(liveAnchor(anchorMs, nowMs, endMs)).toISOString()
  const publishTime = new Date(nowMs).toISOString()

  const shiftDepth = Math.max(endMs - timelineStartMs, targetMs)

  // Shaka keeps the first manifest's delay for the whole session (shaka-player 4.16, outside low-latency mode), and a live
  // open lists 1 to 3 segments, so the live start is the first listed segment and the buffer grows from there
  const presentationDelay = Math.min(targetMs * 3, deliveredMs)

  const updatePeriod = Math.max(1_000, Math.round(targetMs / 2))

  return '<?xml version="1.0" encoding="utf-8"?>'
    + '<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" '
    + 'profiles="urn:mpeg:dash:profile:isoff-live:2011" type="dynamic" '
    + `availabilityStartTime="${availabilityStart}" publishTime="${publishTime}" `
    + `minimumUpdatePeriod="${seconds(updatePeriod)}" timeShiftBufferDepth="${seconds(shiftDepth)}" `
    + `minBufferTime="${seconds(targetMs)}" suggestedPresentationDelay="${seconds(presentationDelay)}">`
    + '<Period id="0" start="PT0S">'
    + adaptationSets(videoFormats, 'video', timeline)
    + adaptationSets(audioFormats, 'audio', timeline)
    + '</Period></MPD>'
}
