import type shaka from 'shaka-player'

import { css } from '@emotion/react'
import { Captions, CaptionsOff, Check, ChevronRight, Maximize, Minimize, Pause, PictureInPicture2, Play, RotateCcw, Settings, SkipForward, Volume1, Volume2, VolumeX } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'preact/hooks'

import type { CaptionTrack, Storyboard } from '../frame/protocol'
import type { PlayerChapter } from './chapters'
import type { SleepTimer } from './sleep-timer'
import type { SkipSegment } from './sponsorblock'
import type { PlayerState } from './use-player-state'

import { bestStoryboard, storyboardFrame } from '../frame/storyboard'

import { MenuItem, Popup, useDismiss } from '../components/ui/popup'
import { updateSettings } from '../settings'
import { barFill, barOffset, barParts, barWidth, chapterIndexAt, timeAtOffset } from './chapters'
import { RATES } from './rates'
import { setSleepTimer, SLEEP_MINUTES, sleepDetail, sleepDuration } from './sleep-timer'

export const clock = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const rest = total % 60
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
    : `${minutes}:${String(rest).padStart(2, '0')}`
}

/* youtube.com's 2025 bar, measured headless at 1280 and 1920 (the sizes do not scale with the player):
   40 px tall groups on a 30% black wash, 12 px from the sides and 8 px from the bottom, no gradient behind them, and the
   4 px rail resting 1 px above the 56 px row of groups */
const style = css`
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 0 1.2rem;
  color: #ffffff;
  opacity: 0;
  transition: opacity 0.2s ease;
  pointer-events: none;

  &.visible {
    opacity: 1;
    pointer-events: auto;
  }

  /* Live cannot seek: the server answers every request with the edge segment
     regardless of the position asked for, so a draggable rail would promise
     something the transport does not do. */
  .scrubber.live {
    pointer-events: none;
  }

  .scrubber.live .knob {
    display: none;
  }

  .scrubber {
    position: relative;
    height: 1.6rem;
    display: flex;
    align-items: flex-end;
    padding-bottom: 0.1rem;
    cursor: pointer;
    touch-action: none;
  }

  .rail {
    position: relative;
    width: 100%;
    height: 0.4rem;
  }

  /* youtube.com's chapters: square ends 4 px apart, 4 px tall, 6 px while the pointer is on the bar and 10 px for the
     chapter under it, growing about their middle */
  .part {
    position: absolute;
    top: 50%;
    height: 100%;
    overflow: hidden;
    background: rgba(40, 40, 40, 0.6);
    transform: translateY(-50%);
    transition: height 0.1s ease;
  }

  .scrubber:hover .part,
  .scrubber.scrubbing .part {
    height: 0.6rem;
  }

  .scrubber .part.hovered {
    height: 1rem;
  }

  .buffered,
  .played {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
  }

  .buffered {
    background: rgba(255, 255, 255, 0.4);
  }

  .played {
    background: var(--brand-red);
  }

  /* SponsorBlock's own colour for sponsors */
  .sponsor {
    position: absolute;
    top: 0;
    bottom: 0;
    background: #00d400;
  }

  .knob {
    position: absolute;
    top: 50%;
    width: 1.2rem;
    height: 1.2rem;
    margin-left: -0.6rem;
    border-radius: 50%;
    background: var(--brand-red);
    transform: translateY(-50%);
    transition: transform 0.1s ease;
  }

  .scrubber:hover .knob,
  .scrubber.scrubbing .knob {
    transform: translateY(-50%) scale(1.3);
  }

  .preview {
    position: absolute;
    bottom: 100%;
    margin-bottom: 0.8rem;
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
    display: inline-flex;
    gap: 0.8rem;
    max-width: 30rem;
    margin-top: 0.4rem;
    padding: 0 0.8rem;
    border-radius: 1.2rem;
    background: rgba(0, 0, 0, 0.6);
    font-size: 1.3rem;
    line-height: 2.4rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .preview-chapter {
    overflow: hidden;
    font-weight: 500;
    text-overflow: ellipsis;
  }

  .bar {
    display: flex;
    align-items: center;
    height: 5.6rem;
  }

  /* the groups left of the spacer, which the player's frame can hold short of the middle */
  .left {
    display: flex;
    align-items: center;
    min-width: 0;
  }

  .spacer {
    flex: 1;
  }

  .control {
    position: relative;
    flex: none;
    width: 4.8rem;
    height: 4rem;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: none;
    border-radius: 2.8rem;
    background: transparent;
    color: #ffffff;
    cursor: pointer;
  }

  /* after .control, whose transparent background would otherwise win on a control that is its own group */
  .group {
    position: relative;
    flex: none;
    height: 4rem;
    border-radius: 2.8rem;
    background: rgba(0, 0, 0, 0.3);
  }

  /* the hover wash: a 32 px band inside the shared group, and the whole shape of a control that is its own group */
  .control::after,
  .volume::after,
  .chapter::after {
    content: '';
    position: absolute;
    inset: 0.4rem 0;
    border-radius: 4rem;
    background: rgba(255, 255, 255, 0.1);
    opacity: 0;
    transition: opacity 0.1s ease;
    pointer-events: none;
  }

  .control:hover::after,
  .volume:hover::after,
  .chapter:hover::after {
    opacity: 1;
  }

  .play {
    width: 4rem;
    border-radius: 50%;
  }

  .play::after {
    inset: 0.4rem;
    border-radius: 50%;
  }

  .next {
    margin-left: 0.8rem;
  }

  .next::after,
  .volume::after {
    inset: 0;
    border-radius: inherit;
  }

  .volume {
    display: flex;
    align-items: center;
    margin-left: 1.2rem;
  }

  .volume .control {
    width: 4rem;
  }

  .volume .control::after {
    display: none;
  }

  .volume-slider {
    width: 0;
    overflow: hidden;
    transition: width 0.2s ease, margin 0.2s ease;
  }

  .volume:hover .volume-slider,
  .volume:focus-within .volume-slider {
    width: 5.2rem;
    margin-right: 1.6rem;
  }

  .volume-slider input {
    width: 5.2rem;
    accent-color: #ffffff;
    cursor: pointer;
  }

  /* the groups that give way, so a long chapter title and then an hour-long clock clip rather than pushing a button out of the player */
  .time,
  .live-badge,
  .chapter {
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    margin-left: 0.8rem;
    padding: 0 1.6rem;
    font-size: 1.4rem;
    line-height: 4rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .time .current {
    font-weight: 500;
  }

  /* the title and youtube.com's 20 px chevron after it, which opens the chapter list, in at most a quarter of the
     player's width (measured 2026-11-10 at 704 to 1920 px, in full screen and on the watch page) */
  .chapter {
    flex-shrink: 100;
    display: flex;
    align-items: center;
    max-width: 25cqi;
    border: none;
    color: inherit;
    font: inherit;
    font-size: 1.3rem;
    font-weight: 500;
    cursor: pointer;
  }

  .chapter::after {
    inset: 0;
    border-radius: inherit;
  }

  .chapter-title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .chapter svg {
    flex: none;
  }

  .live-badge {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    font-weight: 500;
  }

  .live-badge::before {
    content: '';
    flex: none;
    width: 0.8rem;
    height: 0.8rem;
    border-radius: 50%;
    background: #f00;
  }

  .right {
    display: flex;
    margin-left: 0.8rem;
    padding: 0 0.4rem;
  }

  .menu-anchor {
    position: relative;
  }

  .autoplay-track {
    position: relative;
    width: 3rem;
    height: 1.8rem;
    border-radius: 0.9rem;
    background: rgba(255, 255, 255, 0.1);
    transition: background 0.15s ease;
  }

  .autoplay-knob {
    position: absolute;
    top: 0.2rem;
    left: 0.2rem;
    display: grid;
    place-items: center;
    width: 1.4rem;
    height: 1.4rem;
    border-radius: 50%;
    background: #ffffff;
    color: #000000;
    transition: transform 0.15s ease, background 0.15s ease;
  }

  .autoplay[aria-checked='true'] .autoplay-track {
    background: #ffffff;
  }

  .autoplay[aria-checked='true'] .autoplay-knob {
    background: #000000;
    color: #ffffff;
    transform: translateX(1.2rem);
  }

  .settings-menu {
    bottom: calc(100% + 0.8rem);
    top: auto;
  }

  /* below these player widths the clock would clip, so the chapter goes first, then the volume slider and 8 px of each
     right-hand button (yt-client draws Next and PiP, which youtube.com's bar does not) */
  @container player (max-width: 760px) {
    .chapter {
      display: none;
    }
  }

  @container player (max-width: 700px) {
    .volume-slider {
      display: none;
    }

    .right .control {
      width: 4rem;
    }
  }

  /* the 400 px miniplayer dock: youtube.com narrows its controls to 32 px here */
  @container player (max-width: 600px) {
    padding: 0 0.8rem;

    .next,
    .volume,
    .time,
    .live-badge,
    .right {
      margin-left: 0.4rem;
    }

    .time,
    .live-badge {
      padding: 0 1rem;
    }

    .right {
      padding: 0 0.2rem;
    }

    .right .control {
      width: 3.2rem;
    }

    .autoplay,
    .theater-toggle {
      display: none;
    }
  }
`

type ControlsProps = {
  video: HTMLVideoElement
  player: shaka.Player | undefined
  state: PlayerState
  heights: number[]
  storyboards: Storyboard[]
  quality: 'auto' | number
  onQuality: (value: 'auto' | number) => void
  captionTracks: CaptionTrack[]
  caption: string | undefined
  onCaption: (trackId: string | undefined) => void
  onToggleCaption: () => void
  theater: boolean
  onTheater: () => void
  onNext?: () => void
  autoplay?: boolean
  onAutoplay?: (value: boolean) => void
  visible: boolean
  isLive?: boolean
  chapters?: readonly PlayerChapter[]
  onChapters?: () => void
  segments?: readonly SkipSegment[]
  /** Told whether a settings menu is open, which keeps the controls shown while the pointer is still. */
  onMenu?: (open: boolean) => void
  sleepTimer?: SleepTimer
  // counts the requests to open the Sleep timer panel, so each one opens it again
  sleepMenu?: number
}

export const PlayerControls = (
  {
    video, state, heights, storyboards, quality, onQuality, captionTracks, caption, onCaption, onToggleCaption,
    theater, onTheater, onNext, autoplay, onAutoplay, visible, isLive = false, chapters = [], onChapters, segments = [], onMenu,
    sleepTimer, sleepMenu = 0,
  }: ControlsProps,
) => {
  const [scrubbing, setScrubbing] = useState(false)
  const [preview, setPreview] = useState<number | undefined>(undefined)
  const [hover, setHover] = useState<{ time: number, ratio: number } | undefined>(undefined)
  const [pip, setPip] = useState(false)
  const [menu, setMenu] = useState<'root' | 'quality' | 'speed' | 'captions' | 'sleep' | undefined>(undefined)
  const railRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuTriggerRef = useRef<HTMLButtonElement>(null)
  const [fullscreen, setFullscreen] = useState(false)

  const closeMenu = useCallback(() => setMenu(undefined), [])
  const menuOpen = menu !== undefined
  useDismiss({ open: menuOpen, onClose: closeMenu, rootRef: menuRef, triggerRef: menuTriggerRef })
  useEffect(() => {
    onMenu?.(menuOpen)
    return () => onMenu?.(false)
  }, [menuOpen])

  const sleepMenuSeen = useRef(sleepMenu)
  useEffect(() => {
    if (sleepMenu === sleepMenuSeen.current) return
    sleepMenuSeen.current = sleepMenu
    setMenu('sleep')
  }, [sleepMenu])

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement !== null)
    document.addEventListener('fullscreenchange', onChange)
    onChange()
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  useEffect(() => {
    const sync = () => setPip(document.pictureInPictureElement === video)
    video.addEventListener('enterpictureinpicture', sync)
    video.addEventListener('leavepictureinpicture', sync)
    sync()
    return () => {
      video.removeEventListener('enterpictureinpicture', sync)
      video.removeEventListener('leavepictureinpicture', sync)
    }
  }, [video])

  const duration = state.duration
  const position = preview ?? state.currentTime
  const chapter = chapters[chapterIndexAt(chapters, position)]
  const parts = barParts(chapters, duration)
  const offset = (time: number) => barOffset(parts, duration, time)
  const hoverChapter = hover ? chapters[chapterIndexAt(chapters, hover.time)] : undefined
  const hoverPart = hover && parts.length > 1 ? parts.findLastIndex(part => part.start <= hover.time) : -1

  const timeAt = (clientX: number) => {
    const rail = railRef.current
    if (!rail || duration <= 0) return 0
    const boxes = [...rail.querySelectorAll('.part')].map(part => part.getBoundingClientRect())
    return timeAtOffset(parts, boxes, clientX)
  }

  const onPointerDown = (event: PointerEvent) => {
    // a right-click opens the player menu rather than seeking
    if (duration <= 0 || event.button !== 0) return
    const target = event.currentTarget as HTMLElement
    target.setPointerCapture(event.pointerId)
    setScrubbing(true)
    setPreview(timeAt(event.clientX))
  }

  const onPointerMove = (event: PointerEvent) => {
    const rail = railRef.current
    if (rail && duration > 0) {
      const box = rail.getBoundingClientRect()
      setHover({
        time: timeAt(event.clientX),
        ratio: Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)),
      })
    }
    if (!scrubbing) return
    setPreview(timeAt(event.clientX))
  }

  const onPointerUp = (event: PointerEvent) => {
    if (!scrubbing) return
    const target = event.currentTarget as HTMLElement
    target.releasePointerCapture(event.pointerId)
    video.currentTime = timeAt(event.clientX)
    setScrubbing(false)
    setPreview(undefined)
  }

  const onVolume = (event: Event) => {
    const value = Number((event.currentTarget as HTMLInputElement).value)
    video.volume = value
    video.muted = value === 0
    updateSettings({ volume: value, muted: video.muted })
  }

  const toggleMute = () => {
    const muted = !video.muted
    video.muted = muted
    if (!muted && video.volume === 0) video.volume = 0.5
    updateSettings({ muted, volume: video.volume })
  }

  const onRate = (rate: number) => {
    video.playbackRate = rate
    updateSettings({ playbackRate: rate })
    setMenu(undefined)
  }

  const toggleFullscreen = () => {
    const container = video.closest('[data-player-root]')
    if (!document.fullscreenElement) void container?.requestFullscreen().catch(() => {})
    else void document.exitFullscreen().catch(() => {})
  }

  const togglePip = () => {
    if (document.pictureInPictureElement) {
      void document.exitPictureInPicture().catch(() => {})
      return
    }
    void video.requestPictureInPicture().catch(() => {})
  }

  // hidden rather than disabled where the browser cannot do it at all (Firefox exposes no API, and a video can opt out)
  const pipSupported = document.pictureInPictureEnabled === true && !video.disablePictureInPicture

  const board = bestStoryboard(storyboards)
  const frame = board && hover ? storyboardFrame(board, hover.time) : undefined

  const VolumeIcon = state.muted || state.volume === 0 ? VolumeX : state.volume < 0.5 ? Volume1 : Volume2

  const activeCaption = captionTracks.find((track) => track.id === caption)
  const activeLabel = video.videoHeight > 0 ? `${video.videoHeight}p` : undefined
  const videoLeft = Math.max(0, duration - state.currentTime)

  // youtube.com goes back to the settings rather than closing them
  const pickSleep = (choice: number | 'end' | undefined) => {
    setSleepTimer(choice)
    setMenu('root')
  }

  return (
    <div css={style} className={visible || scrubbing || menuOpen ? 'visible' : undefined}>
      <div
        className={`${scrubbing ? 'scrubber scrubbing' : 'scrubber'}${isLive ? ' live' : ''}`}
        role='slider'
        aria-label='Seek'
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(position)}
        aria-valuetext={clock(position)}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => setHover(undefined)}
      >
        <div className='rail' ref={railRef}>
          {parts.map((part, index) => (
            <div
              key={index}
              className={index === hoverPart ? 'part hovered' : 'part'}
              style={{ left: offset(part.start), width: barWidth(parts, duration, part) }}
            >
              <div className='buffered' style={{ width: barFill(part, state.buffered) }} />
              <div className='played' style={{ width: barFill(part, position) }} />
            </div>
          ))}
          {duration > 0
            ? segments.map((part, index) => (
              <div
                key={index}
                className='sponsor'
                style={{ left: offset(part.start), width: `calc(${offset(Math.min(part.end, duration))} - ${offset(part.start)})` }}
              />
            ))
            : undefined}
          <div className='knob' style={{ left: offset(position) }} />
        </div>
        {hover
          ? (
            <div className='preview' style={{ left: `${hover.ratio * 100}%` }}>
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
              <div className='preview-time'>
                <span>{clock(hover.time)}</span>
                {hoverChapter ? <span className='preview-chapter'>{hoverChapter.title}</span> : undefined}
              </div>
            </div>
          )
          : undefined}
      </div>
      <div className='bar'>
        <div className='left'>
          <button type='button' className='control group play' aria-label={state.ended ? 'Replay' : state.paused ? 'Play' : 'Pause'} onClick={() => (state.paused ? void video.play().catch(() => {}) : video.pause())}>
            {state.ended
              ? <RotateCcw size={22} strokeWidth={2} />
              : state.paused ? <Play size={22} fill='currentColor' strokeWidth={0} /> : <Pause size={22} fill='currentColor' strokeWidth={0} />}
          </button>
          {onNext ? <button type='button' className='control group next' aria-label='Next' onClick={onNext}><SkipForward size={22} fill='currentColor' strokeWidth={2} /></button> : undefined}
          <div className='group volume'>
            <button type='button' className='control' aria-label={state.muted ? 'Unmute' : 'Mute'} onClick={toggleMute}>
              <VolumeIcon size={24} strokeWidth={1.8} />
            </button>
            <div className='volume-slider'>
              <input
                type='range'
                min={0}
                max={1}
                step={0.05}
                value={state.muted ? 0 : state.volume}
                aria-label='Volume'
                onInput={onVolume}
              />
            </div>
          </div>
          {/* a live presentation timeline is the stream's own clock: the position reads like 3348:05:43 and the duration is 0 */}
          {isLive
            ? <span className='group live-badge'>LIVE</span>
            : <span className='group time'><span className='current'>{clock(position)}</span> / {clock(duration)}</span>}
          {chapter && !isLive
            ? (
              <button type='button' className='group chapter' aria-label={chapter.title} onClick={onChapters}>
                <span className='chapter-title'>{chapter.title}</span>
                <ChevronRight size={20} strokeWidth={2} />
              </button>
            )
            : undefined}
        </div>
        <span className='spacer' />
        <div className='group right'>
          {onAutoplay && !isLive
            ? (
              <button
                type='button'
                className='control autoplay'
                role='switch'
                aria-label='Autoplay'
                aria-checked={autoplay === true}
                onClick={() => onAutoplay(!autoplay)}
              >
                <span className='autoplay-track'>
                  <span className='autoplay-knob'>
                    {autoplay ? <Play size={9} fill='currentColor' strokeWidth={0} /> : <Pause size={9} fill='currentColor' strokeWidth={0} />}
                  </span>
                </span>
              </button>
            )
            : undefined}
          {captionTracks.length > 0
            ? (
              <button
                type='button'
                className='control'
                aria-label={caption ? 'Turn off captions' : 'Turn on captions'}
                aria-pressed={caption !== undefined}
                onClick={onToggleCaption}
              >
                {caption ? <Captions size={24} strokeWidth={1.8} /> : <CaptionsOff size={24} strokeWidth={1.8} />}
              </button>
            )
            : undefined}
          <div className='menu-anchor' ref={menuRef}>
            <button
              ref={menuTriggerRef}
              type='button'
              className='control'
              aria-label='Settings'
              aria-haspopup='menu'
              aria-expanded={menu !== undefined}
              onClick={() => setMenu(value => (value === undefined ? 'root' : undefined))}
            >
              <Settings size={24} strokeWidth={1.8} />
            </button>
            {menu === 'root'
              ? (
                <Popup label='Player settings' class='settings-menu'>
                  <MenuItem
                    detail={activeCaption ? activeCaption.label : 'Off'}
                    disabled={captionTracks.length === 0}
                    onSelect={() => setMenu('captions')}
                  >
                    Subtitles
                  </MenuItem>
                  <MenuItem detail={sleepDetail(sleepTimer, videoLeft)} onSelect={() => setMenu('sleep')}>
                    Sleep timer
                  </MenuItem>
                  <MenuItem detail={state.playbackRate === 1 ? 'Normal' : `${state.playbackRate}x`} onSelect={() => setMenu('speed')}>
                    Playback speed
                  </MenuItem>
                  <MenuItem
                    detail={quality === 'auto' ? `Auto${activeLabel ? ` (${activeLabel})` : ''}` : `${quality}p`}
                    disabled={heights.length === 0}
                    onSelect={() => setMenu('quality')}
                  >
                    Quality
                  </MenuItem>
                </Popup>
              )
              : menu === 'speed'
                ? (
                  <Popup label='Playback speed' class='settings-menu'>
                    {RATES.map(rate => (
                      <MenuItem key={rate} icon={rate === state.playbackRate ? Check : undefined} onSelect={() => onRate(rate)}>
                        {rate === 1 ? 'Normal' : `${rate}x`}
                      </MenuItem>
                    ))}
                  </Popup>
                )
                : menu === 'captions'
                  ? (
                    <Popup label='Subtitles' class='settings-menu'>
                      <MenuItem
                        icon={caption === undefined ? Check : undefined}
                        onSelect={() => {
                          onCaption(undefined)
                          setMenu(undefined)
                        }}
                      >
                        Off
                      </MenuItem>
                      {captionTracks.map(track => (
                        <MenuItem
                          key={track.id}
                          icon={caption === track.id ? Check : undefined}
                          detail={track.auto ? 'auto' : undefined}
                          onSelect={() => {
                            onCaption(track.id)
                            setMenu(undefined)
                          }}
                        >
                          {track.label}
                        </MenuItem>
                      ))}
                    </Popup>
                  )
                  : menu === 'quality'
                    ? (
                      <Popup label='Quality' class='settings-menu'>
                        <MenuItem
                          icon={quality === 'auto' ? Check : undefined}
                          detail={activeLabel}
                          onSelect={() => {
                            onQuality('auto')
                            setMenu(undefined)
                          }}
                        >
                          Auto
                        </MenuItem>
                        {heights.map(height => (
                          <MenuItem
                            key={height}
                            icon={quality === height ? Check : undefined}
                            onSelect={() => {
                              onQuality(height)
                              setMenu(undefined)
                            }}
                          >
                            {`${height}p`}
                          </MenuItem>
                        ))}
                      </Popup>
                    )
                    : menu === 'sleep'
                      ? (
                        <Popup label='Sleep timer' class='settings-menu'>
                          <MenuItem icon={sleepTimer === undefined ? Check : undefined} onSelect={() => pickSleep(undefined)}>
                            Off
                          </MenuItem>
                          {SLEEP_MINUTES.map(minutes => (
                            <MenuItem
                              key={minutes}
                              icon={typeof sleepTimer === 'object' && sleepTimer.minutes === minutes ? Check : undefined}
                              onSelect={() => pickSleep(minutes)}
                            >
                              {`${minutes} minutes`}
                            </MenuItem>
                          ))}
                          {!isLive && duration > 0
                            ? (
                              <MenuItem icon={sleepTimer === 'end' ? Check : undefined} detail={sleepDuration(videoLeft)} onSelect={() => pickSleep('end')}>
                                End of video
                              </MenuItem>
                            )
                            : undefined}
                        </Popup>
                      )
                      : undefined}
          </div>
          {pipSupported
            ? (
              <button
                type='button'
                className='control'
                aria-label={pip ? 'Exit picture in picture' : 'Picture in picture'}
                aria-pressed={pip}
                onClick={togglePip}
              >
                <PictureInPicture2 size={24} strokeWidth={1.8} />
              </button>
            )
            : undefined}
          <button type='button' className='control theater-toggle' aria-label='Theater mode' aria-pressed={theater} onClick={onTheater}>
            {/* two nested rectangles read as "wide screen" */}
            <svg width='24' height='24' viewBox='0 0 24 24' aria-hidden='true' fill='none' stroke='currentColor' strokeWidth='1.8'>
              <rect x='2' y='6' width='20' height='12' rx='1.5' />
              {theater ? <rect x='6' y='9' width='12' height='6' rx='1' /> : undefined}
            </svg>
          </button>
          <button type='button' className='control' aria-label={fullscreen ? 'Exit full screen' : 'Full screen'} onClick={toggleFullscreen}>
            {fullscreen ? <Minimize size={24} strokeWidth={1.8} /> : <Maximize size={24} strokeWidth={1.8} />}
          </button>
        </div>
      </div>
    </div>
  )
}

export default PlayerControls

export const isTypingTarget = (target: EventTarget | null) => {
  const element = target as HTMLElement | null
  return Boolean(element && (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.isContentEditable))
}
