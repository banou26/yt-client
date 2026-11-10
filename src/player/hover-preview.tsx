import { css } from '@emotion/react'
import { Captions, CaptionsOff, Radio, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useRef, useState } from 'preact/hooks'
import { useLocation } from 'wouter'

import type { CaptionTrack, Storyboard } from '../frame/protocol'

import { preferredTrack } from '../frame/captions'
import { bestStoryboard, storyboardFrame } from '../frame/storyboard'

import { startEngine } from '../scramjet/client'
import { getSettings } from '../settings'
import { clock } from './controls'
import { warmShaka } from './prefetch'

import type { startShakaPlayback } from './shaka'

// only ONE preview can be live at a time: module scope because no single card can know about the others
let activeToken = 0

const DWELL_MS = 700

// carried between previews and deliberately NOT persisted: a feed may never start talking on its own
let preferMuted = true

// on by default, as youtube.com's previews are, in the viewer's language; the switch is not carried to the next card
const previewCaption = (tracks: CaptionTrack[]) =>
  preferredTrack(tracks, getSettings().captionsLanguage ?? navigator.language)

// the preview sits inside the card's watch link, so an unguarded press or click on a control opens the video
const guard = (event: Event) => {
  event.preventDefault()
  event.stopPropagation()
}

// a preview that has played or been moved this far opens the video where it is, not at 0:00
const CARRY_SECONDS = 10

// a card wants the largest sheet that FITS, not the sharpest one `bestStoryboard` picks
const previewStoryboard = (boards: Storyboard[], stripWidth: number) => {
  const fitting = boards.filter((board) => board.thumbnailWidth <= stripWidth * 0.6)
  if (fitting.length) return bestStoryboard(fitting)
  return boards.reduce<Storyboard | undefined>(
    (best, board) => (!best || board.thumbnailWidth < best.thumbnailWidth ? board : best),
    undefined,
  )
}

const style = css`
  position: absolute;
  inset: 0;
  background: #000;
  /* Above the card's own thumbnail overlays.

     The duration badge and the resume bar are siblings drawn AFTER this one, and
     the resume bar is deliberately last so it wins wherever the two overlap. It
     therefore also won over the scrubber: both sit flush to the bottom edge, the
     resume bar is 4px and the scrubber's visible track is the bottom 3px of its
     strip, so the track was painted UNDER a bar of the same brand red. What the
     reader saw was a scrubber; what the pointer hit was a span with no handler,
     so dragging it did nothing. The preview covers the whole thumbnail anyway,
     so it owns this box while it is up. */
  z-index: 1;

  /* Held invisible until the video actually has a frame to show.

     This box is opaque black and it covers the thumbnail from the moment it
     mounts, so every millisecond of session setup was painted as a black
     rectangle where a picture used to be, which reads as the card breaking
     rather than as the card loading. Fading the preview IN is the same thing as
     fading the thumbnail OUT, and it needs no second element and no
     coordination with the card: the still is simply still there, underneath.

     It also fixes the failure case. A preview that never produces a frame now
     leaves the thumbnail up forever instead of leaving a black hole, which is
     the behaviour the silent-failure design already asked for everywhere else
     in this file. */
  opacity: 0;
  transition: opacity 0.18s ease;

  &[data-painted] {
    opacity: 1;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }

  video {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  /* the browser sizes cues to 5% of the element's height, which is 14 px on a 500 px card */
  video::cue {
    font-size: 1.8rem;
    background: rgba(8, 8, 8, 0.75);
  }

  /* The grab area is deliberately several times the height of the bar it draws.
     A 3px track on the last pixels of a thumbnail is not a pointer target at
     any card size, so the strip reaches well above the line and the line itself
     sits at the bottom of it. */
  .scrubber {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 2.4rem;
    display: flex;
    align-items: flex-end;
    cursor: pointer;
    touch-action: none;
  }

  .track {
    position: relative;
    width: 100%;
    height: 0.4rem;
    background: rgba(255, 255, 255, 0.3);
    transition: height 0.12s ease;
  }

  /* Thickens under the pointer, so the thing being aimed at confirms the aim
     before the press rather than after it. */
  .scrubber:hover .track {
    height: 0.6rem;
  }

  /* Buffered sits UNDER played and over the track, the same three-layer stack
     the watch controls use, so the bar reads as "have it / played it / neither"
     rather than as one bar that only knows about the playhead. */
  .buffered {
    position: absolute;
    inset: 0 auto 0 0;
    background: rgba(255, 255, 255, 0.5);
  }

  .fill {
    position: absolute;
    inset: 0 auto 0 0;
    background: var(--brand-red);
  }

  /* hidden at rest, as youtube.com's playhead dot is */
  .knob {
    position: absolute;
    bottom: -0.3rem;
    width: 1.2rem;
    height: 1.2rem;
    margin-left: -0.6rem;
    border-radius: 50%;
    background: var(--brand-red);
    pointer-events: none;
    opacity: 0;
  }

  .scrubber:hover .knob,
  .scrubber.scrubbing .knob {
    opacity: 1;
  }

  .scrubber.scrubbing .track {
    height: 0.6rem;
  }

  /* a storyboard tile scaled up to the whole preview while a drag is held, the video seeking only on release */
  .scrub-frame {
    position: absolute;
    left: 50%;
    top: 50%;
    background-color: #000;
    background-repeat: no-repeat;
    pointer-events: none;
  }

  .scrub-time {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    padding: 0 1.2rem;
    border-radius: 1.6rem;
    background: rgba(0, 0, 0, 0.6);
    color: #fff;
    font-size: 1.4rem;
    font-weight: 500;
    line-height: 3.2rem;
    font-variant-numeric: tabular-nums;
    pointer-events: none;
  }

  /* Storyboard scrub preview: the sheet frame plus its timestamp, centred on
     the pointer and clamped inside the card. Identical treatment to the watch
     scrubber (white border, time underneath) because it is the same gesture. */
  .preview {
    position: absolute;
    bottom: 100%;
    margin-bottom: 0.6rem;
    transform: translateX(-50%);
    pointer-events: none;
    text-align: center;
  }

  .preview-frame {
    border: 2px solid #ffffff;
    border-radius: 0.4rem;
    background-color: #000;
    background-repeat: no-repeat;
  }

  .preview-time {
    margin-top: 0.2rem;
    font-size: 1.2rem;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    text-shadow: 0 1px 3px #000;
  }

  .time {
    position: absolute;
    right: 0.8rem;
    bottom: 0.8rem;
    padding: 0.1rem 0.4rem;
    border-radius: 0.4rem;
    background: var(--bg-badge);
    color: var(--text-on-media);
    font-size: 1.2rem;
    font-weight: 500;
    line-height: 1.8rem;
    font-variant-numeric: tabular-nums;
    pointer-events: none;
  }

  .time.live {
    display: flex;
    align-items: center;
    gap: 0.2rem;
    background: var(--brand-red);
  }

  .scrubber.live {
    pointer-events: none;
  }

  .corner {
    position: absolute;
    top: 0.8rem;
    right: 0.8rem;
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
  }

  .corner button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.8rem;
    height: 2.8rem;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.6);
    color: #fff;
    cursor: pointer;
  }

  .corner button:hover {
    background: rgba(0, 0, 0, 0.8);
  }
`

/**
 * A muted inline preview drawn over a card thumbnail.
 *
 * Mounted only while the pointer is dwelling on the card. Failure is silent by
 * design: this is a hover affordance over a thumbnail that is already correct,
 * so an error card in its place would be worse than no preview.
 *
 * `href` is the card's own watch link. A plain click on the playing preview
 * opens it at the preview's position once that is past CARRY_SECONDS; a live
 * preview opens at the stream's edge.
 * `playerParams` are the card's inline playback params, which the preview's
 * watch page is read with, as youtube.com reads its own.
 */
export const HoverPreview = ({ videoId, href, playerParams }: { videoId: string, href: string, playerParams: string }) => {
  const [, navigate] = useLocation()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [time, setTime] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [ready, setReady] = useState(false)
  const [live, setLive] = useState(false)
  const [painted, setPainted] = useState(false)
  const [muted, setMuted] = useState(preferMuted)
  const [storyboards, setStoryboards] = useState<Storyboard[]>([])
  const [captionTracks, setCaptionTracks] = useState<CaptionTrack[]>([])
  const [caption, setCaption] = useState<string | undefined>()
  const selectCaption = useRef<(trackId: string | undefined) => Promise<void>>(undefined)
  const [hover, setHover] = useState<{ x: number, width: number, time: number } | undefined>()
  const [scrub, setScrub] = useState<{ ratio: number, width: number, height: number } | undefined>()

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const token = ++activeToken
    const abort = new AbortController()
    let controller: Awaited<ReturnType<typeof startShakaPlayback>> | undefined
    video.muted = preferMuted

    const timer = setTimeout(() => {
      void (async () => {
        const [api, { startShakaPlayback }] = await Promise.all([startEngine(), warmShaka()])
        if (abort.signal.aborted || token !== activeToken) return
        controller = await startShakaPlayback({
          api,
          video,
          videoId,
          playerParams,
          startTime: 0,
          signal: abort.signal,
          onError: () => {},
        })
        if (abort.signal.aborted) return
        void video.play().catch(() => {})
        setStoryboards(controller.storyboards)
        setCaptionTracks(controller.captionTracks)
        selectCaption.current = controller.selectCaption
        setLive(controller.isLive)
        setReady(true)
        const wanted = previewCaption(controller.captionTracks)
        if (wanted) {
          setCaption(wanted.id)
          void controller.selectCaption(wanted.id).catch(() => setCaption(undefined))
        }
      })().catch(() => {
        // silent: the thumbnail underneath is still the right thing to show
      })
    }, DWELL_MS)

    const onTime = () => {
      setTime(video.currentTime)
      // the range that CONTAINS the playhead, not the last one: a seek leaves earlier ranges behind
      const ranges = video.buffered
      for (let index = 0; index < ranges.length; index += 1) {
        if (ranges.start(index) <= video.currentTime && video.currentTime <= ranges.end(index)) {
          if (video.duration > 0) setBuffered(ranges.end(index) / video.duration)
          break
        }
      }
    }
    video.addEventListener('timeupdate', onTime)
    video.addEventListener('progress', onTime)

    const onPainted = () => setPainted(true)
    if (video.readyState >= 2) onPainted()
    video.addEventListener('loadeddata', onPainted)

    return () => {
      clearTimeout(timer)
      abort.abort()
      video.removeEventListener('timeupdate', onTime)
      video.removeEventListener('progress', onTime)
      video.removeEventListener('loadeddata', onPainted)
      void controller?.destroy()
    }
  }, [videoId, playerParams])

  const ratioFromPointer = (event: PointerEvent) => {
    const bar = event.currentTarget as HTMLElement
    const box = bar.getBoundingClientRect()
    return Math.min(1, Math.max(0, (event.clientX - box.left) / box.width))
  }

  const scrubFromPointer = (event: PointerEvent) => {
    const root = (event.currentTarget as HTMLElement).parentElement
    if (!root || !videoRef.current?.duration) return
    setScrub({ ratio: ratioFromPointer(event), width: root.clientWidth, height: root.clientHeight })
  }

  // one seek per gesture: every seek cancels the segment in flight, so seeking on each move left the frame stalled
  const seekFromPointer = (event: PointerEvent) => {
    const video = videoRef.current
    setScrub(undefined)
    if (!video || !video.duration) return
    const ratio = ratioFromPointer(event)
    video.currentTime = ratio * video.duration
    setTime(video.currentTime)
  }

  const openAtTime = (event: MouseEvent) => {
    const at = Math.floor(videoRef.current?.currentTime ?? 0)
    // youtube.com opens a live preview at the stream's edge, wherever the preview is (measured 2026-11-11)
    if (live || at < CARRY_SECONDS || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    const url = new URL(href, location.origin)
    url.searchParams.set('t', `${at}s`)
    navigate(url.pathname + url.search)
  }

  const toggleCaption = () => {
    const next = caption ? undefined : (previewCaption(captionTracks) ?? preferredTrack(captionTracks, undefined))?.id
    setCaption(next)
    void selectCaption.current?.(next).catch(() => setCaption(undefined))
  }

  const trackHover = (event: PointerEvent) => {
    const video = videoRef.current
    if (!video?.duration) return
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const ratio = ratioFromPointer(event)
    setHover({ x: event.clientX - box.left, width: box.width, time: ratio * video.duration })
  }

  const duration = videoRef.current?.duration ?? 0
  const scrubBoard = scrub ? bestStoryboard(storyboards) : undefined
  const scrubFrame = scrub && scrubBoard ? storyboardFrame(scrubBoard, scrub.ratio * duration) : undefined
  const scrubScale = scrub && scrubFrame
    ? Math.max(scrub.width / scrubFrame.width, scrub.height / scrubFrame.height)
    : 1
  const position = scrub?.ratio ?? (duration > 0 ? time / duration : 0)

  const board = hover && !scrub ? previewStoryboard(storyboards, hover.width) : undefined
  const frame = board && hover ? storyboardFrame(board, hover.time) : undefined
  // half the tile plus its 2px border
  const half = frame ? frame.width / 2 + 2 : 0
  const previewLeft = hover
    ? Math.min(Math.max(hover.x, half), Math.max(half, hover.width - half))
    : 0

  return (
    <div css={style} data-painted={painted ? '' : undefined} onClick={openAtTime}>
      {/* No preload='none': an element told not to preload never runs its resource selection, so the MediaSource sits at networkState 0 forever */}
      <video ref={videoRef} muted playsInline tabIndex={-1} aria-hidden='true' />
      {scrubFrame
        ? (
          <div
            className='scrub-frame'
            style={{
              width: `${scrubFrame.width}px`,
              height: `${scrubFrame.height}px`,
              backgroundImage: `url("${scrubFrame.url}")`,
              backgroundPosition: `-${scrubFrame.x}px -${scrubFrame.y}px`,
              transform: `translate(-50%, -50%) scale(${scrubScale})`,
            }}
          />
        )
        : undefined}
      {scrub ? <div className='scrub-time'>{clock(scrub.ratio * duration)}</div> : undefined}
      {ready && !scrub
        ? (
          <div className='corner' onPointerDown={guard} onClick={guard}>
            <button
              type='button'
              aria-label={muted ? 'Unmute preview' : 'Mute preview'}
              onClick={() => {
                const video = videoRef.current
                if (!video) return
                video.muted = !video.muted
                preferMuted = video.muted
                setMuted(video.muted)
              }}
            >
              {muted ? <VolumeX size={16} strokeWidth={2} /> : <Volume2 size={16} strokeWidth={2} />}
            </button>
            {captionTracks.length > 0
              ? (
                <button type='button' aria-label='Subtitles/CC' aria-pressed={caption !== undefined} onClick={toggleCaption}>
                  {caption ? <Captions size={16} strokeWidth={2} /> : <CaptionsOff size={16} strokeWidth={2} />}
                </button>
              )
              : undefined}
          </div>
        )
        : undefined}
      {/* time LEFT, as youtube.com's preview counts, and out of the way while the pointer is on the bar */}
      {ready && live
        ? <span className='time live'><Radio size={12} strokeWidth={2.5} />LIVE</span>
        : ready && !scrub && !hover
        ? <span className='time'>{clock(duration - time)}</span>
        : undefined}
      {/* youtube.com's live bar seeks back through the stream, which a live playback here cannot, so it stays full at the edge */}
      {ready && live
        ? (
          <div className='scrubber live'>
            <div className='track'>
              <div className='fill' style={{ width: '100%' }} />
            </div>
          </div>
        )
        : undefined}
      {ready && !live
        ? (
          <div
            className={scrub ? 'scrubber scrubbing' : 'scrubber'}
            onPointerLeave={() => setHover(undefined)}
            onPointerDown={(event: PointerEvent) => {
              guard(event)
              ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
              scrubFromPointer(event)
            }}
            onPointerMove={(event: PointerEvent) => {
              trackHover(event)
              if ((event.currentTarget as HTMLElement).hasPointerCapture(event.pointerId)) scrubFromPointer(event)
            }}
            onPointerUp={(event: PointerEvent) => {
              if ((event.currentTarget as HTMLElement).hasPointerCapture(event.pointerId)) seekFromPointer(event)
            }}
            onPointerCancel={() => setScrub(undefined)}
            onClick={guard}
          >
            <div className='track'>
              <div className='buffered' style={{ width: `${Math.round(buffered * 100)}%` }} />
              <div className='fill' style={{ width: `${position * 100}%` }} />
              <div className='knob' style={{ left: `${position * 100}%` }} />
            </div>
            {hover && !scrub
              ? (
                <div className='preview' style={{ left: `${previewLeft}px` }}>
                  {frame
                    ? (
                      <div
                        className='preview-frame'
                        style={{
                          width: `${frame.width}px`,
                          height: `${frame.height}px`,
                          backgroundImage: `url("${frame.url}")`,
                          backgroundPosition: `-${frame.x}px -${frame.y}px`,
                        }}
                      />
                    )
                    : undefined}
                  <div className='preview-time'>{clock(hover.time)}</div>
                </div>
              )
              : undefined}
          </div>
        )
        : undefined}
    </div>
  )
}

export default HoverPreview
