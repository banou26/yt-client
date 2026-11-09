import type { UpNext } from './up-next'

import { css } from '@emotion/react'
import { Play } from 'lucide-react'
import { useEffect, useRef, useState } from 'preact/hooks'

import { watchHrefFor } from '../components/video-card'
import { prefetchPlayback } from './prefetch'
import { COUNTDOWN_SECONDS } from './up-next'

const style = css`
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2.4rem 2.4rem 7.2rem;
  background: rgba(0, 0, 0, 0.75);
  color: #ffffff;
  font-family: Roboto, Arial, sans-serif;

  .label {
    font-size: 1.6rem;
    color: rgba(255, 255, 255, 0.7);
  }

  .card {
    display: flex;
    align-items: center;
    gap: 1.6rem;
    width: min(100%, 52rem);
    margin-top: 1.2rem;
    color: inherit;
    text-decoration: none;
  }

  .card img,
  .tile img {
    display: block;
    width: 100%;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    border-radius: 0.8rem;
    background: #222;
  }

  .card .thumb {
    flex: none;
    width: 45%;
  }

  .card-text {
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .card-title {
    font-size: 1.8rem;
    font-weight: 500;
    line-height: 2.4rem;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .card-channel {
    margin-top: 0.4rem;
    font-size: 1.4rem;
    color: rgba(255, 255, 255, 0.7);
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 2.4rem;
    margin-top: 1.6rem;
  }

  .cancel {
    height: 3.6rem;
    padding: 0 1.6rem;
    border: none;
    border-radius: 1.8rem;
    background: rgba(255, 255, 255, 0.15);
    color: #ffffff;
    font-size: 1.4rem;
    font-weight: 500;
    cursor: pointer;
  }

  .cancel:hover {
    background: rgba(255, 255, 255, 0.25);
  }

  .play-now {
    position: relative;
    display: grid;
    place-items: center;
    width: 6.4rem;
    height: 6.4rem;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.15);
    color: #ffffff;
    cursor: pointer;
  }

  .ring {
    position: absolute;
    inset: 0;
    transform: rotate(-90deg);
  }

  .ring circle {
    fill: none;
    stroke: #ffffff;
    stroke-width: 3;
    stroke-dasharray: 188.5;
    stroke-dashoffset: 188.5;
    animation: up-next-ring var(--countdown) linear forwards;
  }

  @keyframes up-next-ring {
    to {
      stroke-dashoffset: 0;
    }
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.8rem;
    width: 100%;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .tile {
    position: relative;
    display: block;
    color: inherit;
    text-decoration: none;
  }

  .tile-title {
    position: absolute;
    inset: 0 0 auto;
    padding: 0.8rem;
    border-radius: 0.8rem 0.8rem 0 0;
    background: linear-gradient(rgba(0, 0, 0, 0.8), transparent);
    font-size: 1.3rem;
    font-weight: 500;
    line-height: 1.8rem;
  }

  /* clamped inside the padding, which would otherwise show the top of a third line */
  .tile-title > span {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  @container player (max-width: 560px) {
    padding: 1.2rem 1.2rem 5.6rem;

    .label {
      font-size: 1.3rem;
    }

    .card .thumb {
      display: none;
    }

    .card-title {
      font-size: 1.4rem;
      line-height: 2rem;
      text-align: center;
    }

    .card-channel {
      display: none;
    }

    .actions {
      margin-top: 0.8rem;
    }

    .play-now {
      width: 4.8rem;
      height: 4.8rem;
    }

    .grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    /* one row, all the miniplayer's height holds above the controls */
    .grid li:nth-of-type(n + 3) {
      display: none;
    }
  }
`

export const openOnClick = (target: UpNext, onOpen: (target: UpNext) => void) => (event: MouseEvent) => {
  // the href stays for a new tab; a plain click is the player's to handle, since the miniplayer plays in place
  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  onOpen(target)
}

/** The /watch link for a target, carrying its queue with the 1-based `index` the URL uses. */
export const upNextHref = (target: UpNext) =>
  watchHrefFor(
    target.id,
    target.list !== undefined
      ? { list: target.list, index: target.index !== undefined ? target.index + 1 : undefined }
      : undefined,
  )

/** youtube.com's autoplay countdown over the ended video: it plays `target` when it runs out, unless cancelled. */
export const UpNextCountdown = (
  { target, onOpen, onCancel }: { target: UpNext, onOpen: (target: UpNext) => void, onCancel: () => void },
) => {
  const [left, setLeft] = useState(COUNTDOWN_SECONDS)
  // the owner re-renders with fresh objects, and only a different video may restart the count
  const latest = useRef({ target, onOpen })
  latest.current = { target, onOpen }

  useEffect(() => {
    prefetchPlayback(target.id)
    const started = Date.now()
    const timer = setInterval(() => {
      const remaining = COUNTDOWN_SECONDS - Math.floor((Date.now() - started) / 1000)
      setLeft(Math.max(0, remaining))
      if (remaining > 0) return
      clearInterval(timer)
      latest.current.onOpen(latest.current.target)
    }, 250)
    return () => clearInterval(timer)
  }, [target.id])

  return (
    <div css={style} style={{ '--countdown': `${COUNTDOWN_SECONDS}s` }} data-end-screen='countdown'>
      <div className='label'>Up next in {left}</div>
      <a className='card' href={upNextHref(target)} onClick={openOnClick(target, onOpen)}>
        <span className='thumb'>{target.thumbnail ? <img src={target.thumbnail} alt='' /> : undefined}</span>
        <span className='card-text'>
          <span className='card-title'>{target.title}</span>
          {target.channel ? <span className='card-channel'>{target.channel.name}</span> : undefined}
        </span>
      </a>
      <div className='actions'>
        <button type='button' className='cancel' onClick={onCancel}>Cancel</button>
        <button type='button' className='play-now' aria-label='Play now' onClick={() => onOpen(target)}>
          <svg className='ring' viewBox='0 0 64 64' aria-hidden='true'>
            <circle cx='32' cy='32' r='30' />
          </svg>
          <Play size={28} fill='currentColor' strokeWidth={0} />
        </button>
      </div>
    </div>
  )
}

/** The end screen with Autoplay off: a grid of suggestions from the related list. */
export const EndScreen = (
  { videos, onOpen }: { videos: readonly UpNext[], onOpen: (target: UpNext) => void },
) => (
  <div css={style} data-end-screen='suggestions'>
    <ul className='grid'>
      {videos.slice(0, 8).map(video => (
        <li key={video.id}>
          <a className='tile' href={upNextHref(video)} onClick={openOnClick(video, onOpen)}>
            {video.thumbnail ? <img src={video.thumbnail} alt='' /> : undefined}
            <span className='tile-title'><span>{video.title}</span></span>
          </a>
        </li>
      ))}
    </ul>
  </div>
)
