import type { PlayerState } from './use-player-state'

import { css } from '@emotion/react'
import { Pause, Play, X } from 'lucide-react'

import { clock } from './controls'
import { closePlayer } from './session'

/* youtube.com's miniplayer, measured signed out 2026-11-10 at 1280 and 1920 px: while the pointer is on the video, a
   50% black wash with Expand and Close in the top corners, a 42 px play button in the middle and the clock at the bottom
   left. It draws no Previous or Next at its 400 px, and no control groups. */
const style = css`
  position: absolute;
  inset: 0;
  color: #ffffff;
  opacity: 0;
  transition: opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1) 0.1s;
  /* a click between the buttons reaches the video, which plays and pauses as on youtube.com */
  pointer-events: none;

  [data-player-root]:hover &,
  &:focus-within {
    opacity: 1;
  }

  &.washed {
    background: rgba(0, 0, 0, 0.5);
  }

  button {
    position: absolute;
    display: grid;
    place-items: center;
    width: 4rem;
    height: 4rem;
    padding: 0;
    border: none;
    background: transparent;
    color: inherit;
    cursor: pointer;
    pointer-events: auto;
  }

  .expand {
    top: 0;
    left: 0;
  }

  .close {
    top: 0;
    right: 0;
  }

  .play {
    top: 50%;
    left: 50%;
    width: 4.2rem;
    height: 4.2rem;
    transform: translate(-50%, -50%);
  }

  .time {
    position: absolute;
    left: 1.2rem;
    bottom: 1.7rem;
    color: #eeeeee;
    font-size: 1.2rem;
    line-height: 1.4rem;
    font-variant-numeric: tabular-nums;
  }
`

/**
 * The docked player's own controls, drawn over the video in place of the player bar. `video` is left out while the
 * video cannot play, which leaves Expand and Close; at the end of the video the end screen has the middle of it.
 */
export const MiniplayerControls = (
  { video, state, isLive, onExpand }: {
    video?: HTMLVideoElement
    state: PlayerState
    isLive: boolean
    onExpand?: () => void
  },
) => {
  const playing = video !== undefined && !state.ended
  return (
    <div css={style} className={playing ? 'washed' : undefined}>
      <button type='button' className='expand' aria-label='Expand' aria-keyshortcuts='i' onClick={onExpand}>
        {/* youtube.com's mark: the small picture back in the corner of the large one */}
        <svg width='24' height='24' viewBox='0 0 24 24' aria-hidden='true' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
          <path d='M22 11V5a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h9' />
          <rect x='5' y='7' width='7' height='5' rx='0.5' />
          <path d='M16 19v-5h5M16.5 14.5l5.5 5.5' />
        </svg>
      </button>
      <button type='button' className='close' aria-label='Close miniplayer' onClick={closePlayer}>
        <X size={24} strokeWidth={2} />
      </button>
      {playing
        ? (
          <>
            <button
              type='button'
              className='play'
              aria-label={state.paused ? 'Play' : 'Pause'}
              aria-keyshortcuts='k'
              onClick={() => (state.paused ? void video.play().catch(() => {}) : video.pause())}
            >
              {state.paused ? <Play size={42} fill='currentColor' strokeWidth={0} /> : <Pause size={42} fill='currentColor' strokeWidth={0} />}
            </button>
            {/* a live presentation timeline is the stream's own clock, with no duration to show */}
            {isLive ? undefined : <span className='time'>{clock(state.currentTime)} / {clock(state.duration)}</span>}
          </>
        )
        : undefined}
    </div>
  )
}
