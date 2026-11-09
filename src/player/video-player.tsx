import type shaka from 'shaka-player'

import type { CaptionTrack, PlaybackRefusal, Storyboard } from '../frame/protocol'
import type { Point } from '../components/ui/popup'
import type { BezelCue } from './bezel'
import type { PlayerChapter } from './chapters'
import type { SkipSegment } from './sponsorblock'
import type { UpNext } from './up-next'

// must stay type-only: a value import puts the on-demand shaka chunk back in the entry
import type { startShakaPlayback } from './shaka'

import { LIVE_UNSUPPORTED, playbackRefusal } from '../frame/protocol'
import { preferredTrack } from '../frame/captions'

import { css } from '@emotion/react'
import { createPortal } from 'preact/compat'
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks'

import { resetEngine, startEngine } from '../scramjet/client'
import { warmShaka } from './prefetch'
import { createRestartBudget, resetsEngine } from './restart'
import { registerSeek, clearSeek } from './seek'
import { getSettings, updateSettings } from '../settings'
import { ChaptersPanel } from '../components/chapters'
import { showToast } from '../components/ui/toast'
import { Bezel } from './bezel'
import { chapterIndexAt, chapterStep, publishChapter, setChaptersOpen, useChapterView } from './chapters'
import { isTypingTarget, PlayerControls } from './controls'
import { EndScreen, UpNextCountdown } from './end-screen'
import { RefusalScreen } from './refusal-screen'
import { stepRate } from './rates'
import { PlayerMenu } from './player-menu'
import { ShortcutsDialog } from './shortcuts'
import { CLOCK_SLACK, skipTarget } from './sponsorblock'
import { endAction } from './up-next'
import { usePlayerState } from './use-player-state'

const playerStyle = css`
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border-radius: 14px;
  background: #000;
  position: relative;
  /* the controls and the end screen lay out for the player's own width, which is the miniplayer's 400 px wherever the page is */
  container: player / inline-size;

  /* Fullscreen has to beat BOTH the 16/9 aspect-ratio box and the max-height
     that theater mode puts on this element, or the video is letterboxed inside
     a correctly-fullscreened container. Sizing off the viewport rather than
     100%/100% also survives whatever the ancestor grid was doing. */
  &:fullscreen {
    width: 100vw;
    height: 100vh;
    max-width: none;
    max-height: none;
    aspect-ratio: auto;
    border-radius: 0;
  }

  &:fullscreen video {
    width: 100%;
    height: 100%;
  }

  /* the chapter list is the watch page's outside full screen, and takes the right of the player inside it */
  .chapters-panel {
    display: none;
  }

  &:fullscreen.chapters-open {
    --panel-room: 35.2rem;
  }

  &:fullscreen .chapters-panel {
    display: flex;
  }

  &:fullscreen.chapters-open video {
    width: calc(100% - var(--panel-room));
  }

  video {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  &.idle {
    cursor: none;
  }

  .playback-status {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    pointer-events: none;
    color: var(--text-on-media);
    font: 600 14px/1.4 system-ui, sans-serif;
    text-shadow: 0 1px 4px #000;
  }

  .spinner {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 4.8rem;
    height: 4.8rem;
    margin: -2.4rem 0 0 -2.4rem;
    border: 0.4rem solid rgba(255, 255, 255, 0.25);
    border-top-color: #ffffff;
    border-radius: 50%;
    animation: player-spin 0.8s linear infinite;
    pointer-events: none;
  }

  @keyframes player-spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* above the 72 px of seek rail and control groups, so it never covers a control */
  .sponsor-skip {
    position: absolute;
    right: calc(1.2rem + var(--panel-room, 0rem));
    bottom: 8rem;
    height: 3.6rem;
    padding: 0 1.6rem;
    border: none;
    border-radius: 1.8rem;
    background: rgba(0, 0, 0, 0.6);
    color: #ffffff;
    font-size: 1.4rem;
    font-weight: 500;
    cursor: pointer;
  }

  .sponsor-skip:hover {
    background: rgba(0, 0, 0, 0.8);
  }

  @container player (max-width: 600px) {
    .sponsor-skip {
      right: 0.8rem;
      bottom: 7.6rem;
      height: 3.2rem;
      padding: 0 1.2rem;
      font-size: 1.3rem;
    }
  }
`

const IDLE_MS = 2_500
// how long before a sponsor part Skip sponsor shows, and after a skip Undo does, in seconds of the video
const SPONSOR_NOTICE = 5
const SEEK_STEP = 5
const JUMP_STEP = 10

const requestPlayerFullscreen = (video: HTMLVideoElement | null) => {
  if (document.fullscreenElement) {
    void document.exitFullscreen().catch(() => {})
    return
  }
  void video?.closest('[data-player-root]')?.requestFullscreen().catch(() => {})
}

/**
 * What the player moves on to, decided by the persistent player that owns it.
 *
 * `queued` says whether a playlist entry follows, so the end of the video calls
 * `onNext` at once; otherwise `pick` is the autoplay countdown's target and
 * `suggestions` fill the end screen. `onPrevious` is Shift+P, set only in a
 * playlist. `onOpen` plays a picked video, which on the watch page navigates
 * and in the miniplayer plays in place.
 */
export type PlayerUpNext = {
  autoplay: boolean
  onAutoplay: (value: boolean) => void
  queued: () => boolean
  pick?: UpNext
  suggestions: readonly UpNext[]
  onNext?: () => void
  onPrevious?: () => void
  onOpen: (target: UpNext) => void
}

const FALLBACK_FPS = 30

const VideoPlayer = (
  { videoId, list, title, startAt, docked = false, theater = false, onTheater, onMiniplayer, upNext, chapters, segments = [] }: {
    videoId: string
    list?: string
    title?: string
    startAt?: number
    docked?: boolean
    theater?: boolean
    onTheater?: () => void
    onMiniplayer?: () => void
    upNext?: PlayerUpNext
    chapters?: readonly PlayerChapter[]
    segments?: readonly SkipSegment[]
  },
) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const resumeAt = useRef(startAt ?? 0)
  const [attempt, setAttempt] = useState(0)
  const restarts = useMemo(() => createRestartBudget(), [videoId])
  const [status, setStatus] = useState('Loading player')
  const [refusal, setRefusal] = useState<PlaybackRefusal | undefined>(undefined)
  const [player, setPlayer] = useState<shaka.Player | undefined>(undefined)
  const [heights, setHeights] = useState<number[]>([])
  const [storyboards, setStoryboards] = useState<Storyboard[]>([])
  const [isLive, setIsLive] = useState(false)
  const [quality, setQuality] = useState<'auto' | number>(() => getSettings().quality)
  const selectQualityRef = useRef<((height: number | 'auto') => Promise<void>) | undefined>(undefined)
  const [captionTracks, setCaptionTracks] = useState<CaptionTrack[]>([])
  const [caption, setCaption] = useState<string | undefined>(undefined)
  const selectCaptionRef = useRef<((trackId: string | undefined) => Promise<void>) | undefined>(undefined)
  const [active, setActive] = useState(true)
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [cancelled, setCancelled] = useState(false)
  const [bezel, setBezel] = useState<BezelCue | undefined>(undefined)
  const [shortcuts, setShortcuts] = useState(false)
  const closeShortcuts = useCallback(() => setShortcuts(false), [])
  const [loop, setLoop] = useState(false)
  // from the player's corner, so the menu follows the player as the page scrolls
  const [menu, setMenu] = useState<Point | undefined>(undefined)
  const closeMenu = useCallback(() => setMenu(undefined), [])
  const menuAtPress = useRef(false)
  const flash = useCallback((icon: BezelCue['icon'], text?: string) => {
    setBezel(previous => ({ id: (previous?.id ?? 0) + 1, icon, text }))
  }, [])

  const state = usePlayerState(videoRef.current, player)
  const chapterList = chapters ?? []
  const chapterIndex = chapterIndexAt(chapterList, state.currentTime)
  const chapterView = useChapterView(videoId)
  useEffect(() => publishChapter(videoId, chapterIndex), [videoId, chapterIndex])
  const ending = state.ended && upNext
    ? endAction({ queued: upNext.queued(), autoplay: upNext.autoplay, pick: upNext.pick, cancelled })
    : undefined
  const onNext = upNext?.onNext
  const onPrevious = upNext?.onPrevious

  useEffect(() => {
    if (ending === 'advance') onNext?.()
  }, [ending])

  const sponsors = useRef(segments)
  sponsors.current = segments
  // the parts the viewer's last seek landed in, kept across restarts, which seek too
  const excused = useRef(new Set<SkipSegment>())
  const undone = useRef<readonly SkipSegment[]>([])
  const landing = useRef(Number.NaN)
  const [skipped, setSkipped] = useState<{ from: number, to: number, parts: readonly SkipSegment[] } | undefined>(undefined)

  const skip = (video: HTMLVideoElement, to: number) => {
    const from = video.currentTime
    const at = Math.min(to, video.duration || to)
    landing.current = at
    setSkipped({ from, to: at, parts: sponsors.current.filter(part => part.start < at && part.end > from) })
    video.currentTime = at
  }

  // Undo excuses every part the skip jumped, so a chain of parts plays through rather than skipping from its second part
  const undo = () => {
    const video = videoRef.current
    if (!video || !skipped) return
    undone.current = skipped.parts
    setSkipped(undefined)
    video.currentTime = skipped.from
    void video.play().catch(() => {})
  }

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    // the start position, Shaka's jump over a gap at the start and a restart's resume all seek before the first `playing`, and only a viewer's seek plays a part
    let started = false
    const onPlaying = () => {
      started = true
    }
    const onSeeking = () => {
      const time = video.currentTime
      const own = Math.abs(time - landing.current) < CLOCK_SLACK
      landing.current = Number.NaN
      if (!started) return
      // the skip's own seek keeps its Undo and excuses nothing, and any other seek leaves the Undo behind
      excused.current = new Set([...(own ? [] : sponsors.current.filter(part => part.start <= time && time < part.end)), ...undone.current])
      undone.current = []
      if (!own) setSkipped(undefined)
    }
    const onTimeUpdate = () => {
      const to = video.seeking ? undefined : skipTarget(sponsors.current, video.currentTime, excused.current)
      if (to !== undefined) skip(video, to)
    }
    video.addEventListener('playing', onPlaying)
    video.addEventListener('seeking', onSeeking)
    video.addEventListener('timeupdate', onTimeUpdate)
    return () => {
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('seeking', onSeeking)
      video.removeEventListener('timeupdate', onTimeUpdate)
    }
  }, [attempt])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    // applied BEFORE playback starts, or autoplay is attempted at volume 1 and the browser's block-then-mute fallback loses the stored volume
    const audio = getSettings()
    video.volume = audio.volume
    video.muted = audio.muted
    video.playbackRate = audio.playbackRate
    const abort = new AbortController()
    let controller: Awaited<ReturnType<typeof startShakaPlayback>> | undefined
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    const restart = (error: unknown) => {
      if (abort.signal.aborted || retryTimer !== undefined) return
      resumeAt.current = video.currentTime || resumeAt.current
      const refused = playbackRefusal(error)
      const terminal = (error instanceof Error && error.message === LIVE_UNSUPPORTED) || refused?.final === true
      if (terminal || !restarts.spend()) {
        void controller?.destroy()
        if (refused?.final !== true) console.error(error)
        if (refused) {
          setStatus('')
          setRefusal(refused)
          return
        }
        const message = error instanceof Error ? error.message : String(error)
        setStatus(`Playback failed: ${message}`)
        return
      }
      const engineFailure = resetsEngine(error)
      retryTimer = setTimeout(() => {
        if (!abort.signal.aborted) {
          if (engineFailure) resetEngine()
          setAttempt((value) => value + 1)
        }
      }, restarts.used === 1 && !engineFailure ? 100 : 1_000)
    }
    const played = () => restarts.progress(video.currentTime)
    video.addEventListener('timeupdate', played)
    setStatus('Loading player')
    void (async () => {
      const [api, { startShakaPlayback }] = await Promise.all([startEngine(), warmShaka()])
      controller = await startShakaPlayback({
        api,
        video,
        videoId,
        startTime: resumeAt.current,
        signal: abort.signal,
        onError: restart,
      })
      if (abort.signal.aborted) return
      setStatus('')
      registerSeek(
        videoId,
        (seconds) => {
          video.currentTime = seconds
          void video.play().catch(() => {})
        },
        () => video.currentTime,
      )
      setPlayer(controller.player)
      setHeights(controller.heights)
      setStoryboards(controller.storyboards)
      setIsLive(controller.isLive)
      selectQualityRef.current = controller.selectQuality
      setCaptionTracks(controller.captionTracks)
      selectCaptionRef.current = controller.selectCaption
      const stored = getSettings().quality
      if (stored !== 'auto') void controller.selectQuality(stored).catch(() => {})
      const subtitles = getSettings()
      const wanted = subtitles.captionsEnabled
        ? preferredTrack(controller.captionTracks, subtitles.captionsLanguage)
        : undefined
      setCaption(wanted?.id)
      if (wanted) {
        void controller.selectCaption(wanted.id).catch(() => {
          setCaption((current) => (current === wanted.id ? undefined : current))
        })
      }
    })().catch((error) => {
      if (!abort.signal.aborted) restart(error)
    })
    return () => {
      abort.abort()
      video.removeEventListener('timeupdate', played)
      clearTimeout(retryTimer)
      clearSeek(videoId)
      setPlayer(undefined)
      setHeights([])
      setStoryboards([])
      setIsLive(false)
      setCaptionTracks([])
      void controller?.destroy()
    }
  }, [attempt, videoId])

  const applyQuality = useCallback((value: 'auto' | number) => {
    setQuality(value)
    updateSettings({ quality: value })
    void selectQualityRef.current?.(value).catch(() => {})
  }, [])

  // stores the LANGUAGE rather than the track id, since ids are per video and the next video would not recognize one
  const applyCaption = useCallback((trackId: string | undefined) => {
    setCaption(trackId)
    const picked = captionTracks.find((track) => track.id === trackId)
    updateSettings(picked
      ? { captionsEnabled: true, captionsLanguage: picked.languageCode }
      : { captionsEnabled: false })
    void selectCaptionRef.current?.(trackId).catch(() => {
      if (!trackId) return
      setCaption((current) => (current === trackId ? undefined : current))
      showToast('Subtitles are not available for this video right now')
    })
  }, [captionTracks])

  // remembering the last pick is what makes c and the CC button a toggle rather than a reset
  const lastCaption = useRef<string | undefined>(undefined)
  if (caption) lastCaption.current = caption
  const toggleCaption = () => {
    if (caption) return applyCaption(undefined)
    const restored = lastCaption.current && captionTracks.some((track) => track.id === lastCaption.current)
      ? lastCaption.current
      : preferredTrack(captionTracks, undefined)?.id
    if (restored) applyCaption(restored)
  }

  const wake = useCallback(() => {
    setActive(true)
    clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(() => setActive(false), IDLE_MS)
  }, [])

  useEffect(() => () => clearTimeout(idleTimer.current), [])

  // the menu is drawn on the fullscreen element or the body, so a switch between the two would strand it
  useEffect(() => {
    document.addEventListener('fullscreenchange', closeMenu)
    return () => document.removeEventListener('fullscreenchange', closeMenu)
  }, [closeMenu])

  const onContextMenu = (event: MouseEvent) => {
    // a second right-click gets the browser's own menu, as on youtube.com
    const second = menuAtPress.current
    menuAtPress.current = false
    if (second) return
    event.preventDefault()
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
    setMenu({ x: event.clientX - box.left, y: event.clientY - box.top })
  }

  // read at key time, so the listener is bound once rather than on every rendered frame
  const latest = useRef({ onTheater, onNext, onPrevious, onMiniplayer, toggleCaption, player, shortcuts, chapterList })
  latest.current = { onTheater, onNext, onPrevious, onMiniplayer, toggleCaption, player, shortcuts, chapterList }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const video = videoRef.current
      if (!video || event.defaultPrevented || isTypingTarget(event.target)) return
      const actions = latest.current
      if (actions.shortcuts) return
      const key = event.key
      const handled = () => {
        event.preventDefault()
        wake()
      }
      if (event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && (key === 'ArrowLeft' || key === 'ArrowRight')) {
        const to = chapterStep(actions.chapterList, video.currentTime, key === 'ArrowRight' ? 1 : -1)
        if (to === undefined) return
        handled()
        video.currentTime = to
        return
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return
      const seekBy = (delta: number) => {
        video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + delta))
        flash(delta < 0 ? 'back' : 'forward', String(Math.abs(delta)))
      }
      const setVolume = (volume: number) => {
        video.volume = volume
        updateSettings({ volume: video.volume })
        flash(video.volume === 0 ? 'mute' : 'volume', `${Math.round(video.volume * 100)}%`)
      }
      const stepFrame = (direction: 1 | -1) => {
        const fps = actions.player?.getVariantTracks().find(track => track.active)?.frameRate || FALLBACK_FPS
        video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + direction / fps))
      }
      switch (key) {
        case ' ':
        case 'k':
          handled()
          if (video.paused) {
            void video.play().catch(() => {})
            flash('play')
          } else {
            video.pause()
            flash('pause')
          }
          return
        case 'ArrowLeft': handled(); seekBy(-SEEK_STEP); return
        case 'ArrowRight': handled(); seekBy(SEEK_STEP); return
        case 'j': handled(); seekBy(-JUMP_STEP); return
        case 'l': handled(); seekBy(JUMP_STEP); return
        case 'ArrowUp': handled(); setVolume(Math.min(1, video.volume + 0.05)); return
        case 'ArrowDown': handled(); setVolume(Math.max(0, video.volume - 0.05)); return
        case 'm':
          handled()
          video.muted = !video.muted
          updateSettings({ muted: video.muted })
          flash(video.muted ? 'mute' : 'volume')
          return
        case 'c':
          handled()
          actions.toggleCaption()
          return
        case '<':
        case '>': {
          handled()
          const rate = stepRate(video.playbackRate, key === '>' ? 1 : -1)
          video.playbackRate = rate
          updateSettings({ playbackRate: rate })
          flash('speed', `${rate}x`)
          return
        }
        case ',':
        case '.':
          if (!video.paused) return
          handled()
          stepFrame(key === '.' ? 1 : -1)
          return
        case 'f':
          handled()
          requestPlayerFullscreen(video)
          return
        case 't':
          handled()
          actions.onTheater?.()
          return
        case 'i':
          if (!actions.onMiniplayer) return
          handled()
          actions.onMiniplayer()
          return
        case '?':
          handled()
          setShortcuts(true)
          return
        case 'N':
          if (!event.shiftKey || !actions.onNext) return
          handled()
          actions.onNext()
          return
        case 'P':
          if (!event.shiftKey || !actions.onPrevious) return
          handled()
          actions.onPrevious()
          return
        case 'Home': handled(); video.currentTime = 0; return
        case 'End': handled(); video.currentTime = video.duration || 0; return
        default:
          if (/^[0-9]$/.test(key) && Number.isFinite(video.duration)) {
            handled()
            video.currentTime = (video.duration * Number(key)) / 10
          }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [wake, flash])

  const video = videoRef.current
  const showSpinner = Boolean(player) && (state.buffering || state.seeking)
  const time = state.currentTime
  const undoable = skipped !== undefined && time > skipped.to - CLOCK_SLACK && time < skipped.to + SPONSOR_NOTICE
  const upcoming = undoable
    ? undefined
    : segments.find(part => !excused.current.has(part) && part.start > time && part.start - time <= SPONSOR_NOTICE)

  return (
    <div
      css={playerStyle}
      data-player-root
      className={[!active && !state.paused && !menu && 'idle', chapterView.open && chapterList.length > 0 && 'chapters-open'].filter(Boolean).join(' ') || undefined}
      onPointerMove={wake}
      onPointerLeave={() => setActive(false)}
      onPointerDown={() => {
        menuAtPress.current = menu !== undefined
      }}
      onContextMenu={onContextMenu}
    >
      <video
        key={attempt}
        ref={videoRef}
        playsInline
        preload='auto'
        loop={loop}
        onClick={() => {
          const current = videoRef.current
          // a click that closes the menu only closes it, as on youtube.com
          if (!current || menuAtPress.current) return
          if (current.paused) {
            void current.play().catch(() => {})
            flash('play')
          } else {
            current.pause()
            flash('pause')
          }
        }}
        onDblClick={() => requestPlayerFullscreen(videoRef.current)}
      />
      {showSpinner ? <div className='spinner' /> : undefined}
      {bezel ? <Bezel key={bezel.id} cue={bezel} /> : undefined}
      {status ? <div className='playback-status'>{status}</div> : undefined}
      {refusal ? <RefusalScreen refusal={refusal} /> : undefined}
      {upNext && ending === 'countdown' && upNext.pick
        ? <UpNextCountdown target={upNext.pick} onOpen={upNext.onOpen} onCancel={() => setCancelled(true)} />
        : upNext && ending === 'suggestions' && upNext.suggestions.length > 0
          ? <EndScreen videos={upNext.suggestions} onOpen={upNext.onOpen} />
          : undefined}
      {video && !status && !refusal
        ? (
          <PlayerControls
            video={video}
            player={player}
            state={state}
            heights={heights}
            storyboards={storyboards}
            quality={quality}
            onQuality={applyQuality}
            captionTracks={captionTracks}
            caption={caption}
            onCaption={applyCaption}
            onToggleCaption={toggleCaption}
            theater={theater}
            onTheater={() => onTheater?.()}
            onNext={onNext}
            autoplay={upNext?.autoplay}
            onAutoplay={upNext?.onAutoplay}
            isLive={isLive}
            chapters={chapters}
            onChapters={() => setChaptersOpen(videoId, true)}
            segments={segments}
            visible={active || state.paused}
          />
        )
        : undefined}
      {video && !status && !refusal && undoable
        ? <button type='button' className='sponsor-skip' onClick={undo}>Undo</button>
        : video && !status && !refusal && upcoming
          ? (
            <button
              type='button'
              className='sponsor-skip'
              onClick={() => skip(video, skipTarget(segments, upcoming.start, excused.current) ?? upcoming.end)}
            >
              Skip sponsor
            </button>
          )
          : undefined}
      {chapterView.open && chapterList.length > 0
        ? (
          <ChaptersPanel
            overlay
            videoId={videoId}
            chapters={chapterList}
            current={chapterIndex}
            onClose={() => setChaptersOpen(videoId, false)}
          />
        )
        : undefined}
      {video && menu
        ? (
          <PlayerMenu
            at={() => {
              const box = video.closest('[data-player-root]')!.getBoundingClientRect()
              return { x: box.left + menu.x, y: box.top + menu.y }
            }}
            onClose={closeMenu}
            video={video}
            videoId={videoId}
            list={list}
            title={title}
            loop={loop}
            onLoop={() => setLoop(value => !value)}
            onMiniplayer={docked || document.fullscreenElement ? undefined : onMiniplayer}
            onCopied={flash}
          />
        )
        : undefined}
      {shortcuts ? createPortal(<ShortcutsDialog onClose={closeShortcuts} />, document.body) : undefined}
    </div>
  )
}

export default VideoPlayer
