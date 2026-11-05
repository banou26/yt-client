import type shaka from 'shaka-player'

import type { CaptionTrack, Storyboard } from '../frame/protocol'
import type { BezelCue } from './bezel'
import type { PlayerChapter } from './controls'
import type { UpNext } from './up-next'

// must stay type-only: a value import puts the on-demand shaka chunk back in the entry
import type { startShakaPlayback } from './shaka'

import { LIVE_UNSUPPORTED } from '../frame/protocol'
import { preferredTrack } from '../frame/captions'

import { css } from '@emotion/react'
import { createPortal } from 'preact/compat'
import { useCallback, useEffect, useRef, useState } from 'preact/hooks'

import { resetEngine, startEngine } from '../scramjet/client'
import { warmShaka } from './prefetch'
import { registerSeek, clearSeek } from './seek'
import { getSettings, updateSettings } from '../settings'
import { showToast } from '../components/ui/toast'
import { Bezel } from './bezel'
import { isTypingTarget, PlayerControls } from './controls'
import { EndScreen, UpNextCountdown } from './end-screen'
import { stepRate } from './rates'
import { ShortcutsDialog } from './shortcuts'
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
`

const IDLE_MS = 2_500
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
 * `suggestions` fill the end screen. `onOpen` plays a picked video, which on
 * the watch page navigates and in the miniplayer plays in place.
 */
export type PlayerUpNext = {
  autoplay: boolean
  onAutoplay: (value: boolean) => void
  queued: () => boolean
  pick?: UpNext
  suggestions: readonly UpNext[]
  onNext?: () => void
  onOpen: (target: UpNext) => void
}

const FALLBACK_FPS = 30

const VideoPlayer = (
  { videoId, startAt, theater = false, onTheater, onMiniplayer, upNext, chapters }: {
    videoId: string
    startAt?: number
    theater?: boolean
    onTheater?: () => void
    onMiniplayer?: () => void
    upNext?: PlayerUpNext
    chapters?: readonly PlayerChapter[]
  },
) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const resumeAt = useRef(startAt ?? 0)
  const [attempt, setAttempt] = useState(0)
  const [status, setStatus] = useState('Loading player')
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
  const flash = useCallback((icon: BezelCue['icon'], text?: string) => {
    setBezel(previous => ({ id: (previous?.id ?? 0) + 1, icon, text }))
  }, [])

  const state = usePlayerState(videoRef.current, player)
  const ending = state.ended && upNext
    ? endAction({ queued: upNext.queued(), autoplay: upNext.autoplay, pick: upNext.pick, cancelled })
    : undefined
  const onNext = upNext?.onNext

  useEffect(() => {
    if (ending === 'advance') onNext?.()
  }, [ending])

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
      const terminal = error instanceof Error && error.message === LIVE_UNSUPPORTED
      if (terminal || attempt >= 3) {
        void controller?.destroy()
        const message = error instanceof Error ? error.message : String(error)
        setStatus(`Playback failed: ${message}`)
        console.error(error)
        return
      }
      const engineFailure = error instanceof Error && error.message.startsWith('youtube:')
      retryTimer = setTimeout(() => {
        if (!abort.signal.aborted) {
          if (engineFailure) resetEngine()
          setAttempt((value) => value + 1)
        }
      }, attempt === 0 && !engineFailure ? 100 : 1_000)
    }
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

  // read at key time, so the listener is bound once rather than on every rendered frame
  const latest = useRef({ onTheater, onNext, onMiniplayer, toggleCaption, player, shortcuts })
  latest.current = { onTheater, onNext, onMiniplayer, toggleCaption, player, shortcuts }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const video = videoRef.current
      if (!video || event.defaultPrevented || isTypingTarget(event.target)) return
      if (event.ctrlKey || event.metaKey || event.altKey) return
      const actions = latest.current
      if (actions.shortcuts) return
      const key = event.key
      const handled = () => {
        event.preventDefault()
        wake()
      }
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

  return (
    <div
      css={playerStyle}
      data-player-root
      className={!active && !state.paused ? 'idle' : undefined}
      onPointerMove={wake}
      onPointerLeave={() => setActive(false)}
    >
      <video
        key={attempt}
        ref={videoRef}
        playsInline
        preload='auto'
        onClick={() => {
          const current = videoRef.current
          if (!current) return
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
      {upNext && ending === 'countdown' && upNext.pick
        ? <UpNextCountdown target={upNext.pick} onOpen={upNext.onOpen} onCancel={() => setCancelled(true)} />
        : upNext && ending === 'suggestions' && upNext.suggestions.length > 0
          ? <EndScreen videos={upNext.suggestions} onOpen={upNext.onOpen} />
          : undefined}
      {video && !status
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
            visible={active || state.paused}
          />
        )
        : undefined}
      {shortcuts ? createPortal(<ShortcutsDialog onClose={closeShortcuts} />, document.body) : undefined}
    </div>
  )
}

export default VideoPlayer
