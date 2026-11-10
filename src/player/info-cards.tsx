import type { WatchMetaQuery } from '../generated/graphql'

import { css } from '@emotion/react'
import { Info, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'preact/hooks'

type Teaser = NonNullable<WatchMetaQuery['watch']>['cardTeasers'][number]

// youtube.com's text slides in for 0.33 s after 0.2 s, and only then is it on screen for the teaser's duration
const SLIDE_MS = 530
const COLLAPSE_MS = 330
// a teaser stays while the pointer is on it, and collapses this long after it leaves (measured 2026-11-10)
const LEAVE_MS = 2_000
// longer than playback steps between two reads of the playhead: a seek past a teaser's start shows none, as on youtube.com
const SEEK_STEP = 1.5

/* youtube.com's, measured 2026-11-10 at 1280 and 1920 px, in the page and in full screen alike: the "i" 36 px square,
   8 px from the top and 12 px from the right, and the teaser a 31 px pill 16.5 px from the top on a 60% black wash */
const style = css`
  display: contents;

  .cards-button {
    position: absolute;
    z-index: 1;
    top: 0.8rem;
    right: 1.2rem;
    display: grid;
    place-items: center;
    width: 3.6rem;
    height: 3.6rem;
    padding: 0;
    border: none;
    background: transparent;
    color: #ffffff;
    cursor: pointer;
    filter: drop-shadow(0 0 1px rgba(0, 0, 0, 0.4));
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.1s cubic-bezier(0.4, 0, 1, 1), visibility 0s 0.1s;
  }

  .cards-button.shown {
    opacity: 1;
    visibility: visible;
    transition: opacity 0.25s cubic-bezier(0, 0, 0.2, 1);
  }

  .teaser {
    position: absolute;
    z-index: 1;
    top: 1.65rem;
    right: 1.2rem;
    display: flex;
    align-items: center;
    max-width: calc(100% - 2.4rem);
    height: 3.1rem;
    border-radius: 1.8rem;
    background: rgba(0, 0, 0, 0.6);
    color: #ffffff;
    font: 500 12px/30px Roboto, Arial, sans-serif;
    white-space: nowrap;
    animation: teaser-in 0.33s cubic-bezier(0.05, 0, 0, 1) 0.2s backwards;
  }

  .teaser.out {
    animation: teaser-out 0.33s cubic-bezier(0.05, 0, 0, 1) forwards;
  }

  @keyframes teaser-in {
    from {
      clip-path: inset(0 0 0 100% round 1.8rem);
    }

    to {
      clip-path: inset(0 round 1.8rem);
    }
  }

  @keyframes teaser-out {
    from {
      clip-path: inset(0 round 1.8rem);
    }

    to {
      clip-path: inset(0 0 0 100% round 1.8rem);
    }
  }

  .teaser-open {
    display: flex;
    align-items: center;
    min-width: 0;
    height: 100%;
    padding: 0;
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  .teaser-avatar {
    flex: none;
    width: 2.2rem;
    height: 2.2rem;
    margin: 0.4rem;
    border-radius: 50%;
    object-fit: cover;
  }

  .teaser-text {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .teaser-close {
    display: grid;
    flex: none;
    place-items: center;
    width: 2rem;
    height: 3rem;
    margin: 0 0.5rem;
    padding: 0;
    border: none;
    background: transparent;
    color: #717171;
    cursor: pointer;
  }
`

/**
 * youtube.com's info cards over the player: each teaser slides in when playback reaches its start, stays its duration
 * and while the pointer is on it, then collapses into the corner, where the "i" shows with the controls. A teaser and
 * the "i" both call `onOpen`, which shows the cards. `shown` is the controls' own visibility; the teaser's avatar is the
 * channel card's, which /next sends as the teaser's own on every video measured.
 */
export const InfoCards = (
  { teasers, avatar, time, shown, ended, onOpen }: {
    teasers: readonly Teaser[]
    avatar?: string | null
    time: number
    shown: boolean
    ended: boolean
    onOpen: () => void
  },
) => {
  const [teaser, setTeaser] = useState<{ index: number, out: boolean, left?: boolean } | undefined>(undefined)
  const [hovered, setHovered] = useState(false)
  // from the start, so a teaser due at the very start shows on the first read of a video that plays from there
  const last = useRef(0)

  useEffect(() => {
    const previous = last.current
    last.current = time
    if (time < previous || time - previous > SEEK_STEP) return
    const index = teasers.findIndex(({ startMs }) => previous < startMs / 1_000 && startMs / 1_000 <= time)
    if (index < 0) return
    setTeaser({ index, out: false })
    setHovered(false)
  }, [time, teasers])

  // timed by the clock rather than the playhead, so a teaser collapses on time in a paused video, as on youtube.com
  useEffect(() => {
    if (!teaser || (hovered && !teaser.out)) return
    const timer = teaser.out
      ? setTimeout(() => setTeaser(undefined), COLLAPSE_MS)
      : setTimeout(() => setTeaser({ ...teaser, out: true }), teaser.left ? LEAVE_MS : SLIDE_MS + (teasers[teaser.index]?.durationMs ?? 0))
    return () => clearTimeout(timer)
  }, [teaser, teasers, hovered])

  const current = teaser && !ended ? teasers[teaser.index] : undefined
  const open = () => {
    setTeaser(undefined)
    onOpen()
  }
  return (
    <div css={style}>
      <button
        type='button'
        className={shown && !current && !ended ? 'cards-button shown' : 'cards-button'}
        aria-label='Show cards'
        onClick={open}
      >
        <Info size={22} strokeWidth={2} />
      </button>
      {current
        ? (
          <div
            key={teaser!.index}
            className={teaser!.out ? 'teaser out' : 'teaser'}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => {
              setHovered(false)
              setTeaser(shown => shown && !shown.out ? { ...shown, left: true } : shown)
            }}
          >
            <button type='button' className='teaser-open' onClick={open}>
              {avatar ? <img className='teaser-avatar' src={avatar} alt='' /> : undefined}
              <span className='teaser-text'>{current.text}</span>
            </button>
            <button type='button' className='teaser-close' aria-label='Close' onClick={() => setTeaser({ ...teaser!, out: true })}>
              <X size={20} strokeWidth={2} />
            </button>
          </div>
        )
        : undefined}
    </div>
  )
}
