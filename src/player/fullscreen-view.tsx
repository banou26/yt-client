import { css } from '@emotion/react'
import { ChevronDown, ChevronUp, Forward, ListPlus, MessageSquareText, ThumbsDown, ThumbsUp, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'preact/hooks'

import Comments from '../components/comments'
import { formatDuration, formatMeta } from '../components/format'
import { useRateVideo } from '../components/rate-video'
import SaveMenu from '../components/save-menu'
import ShareDialog from '../components/share-dialog'
import { Thumbnail } from '../components/thumbnail'
import { isTypingTarget } from './controls'
import { openOnClick, upNextHref } from './end-screen'
import { useFrame } from './player-frame'

// youtube.com's grid holds the first 12 related videos at every width (measured 2026-11-10 at 1024, 1280 and 1920 px)
const GRID_SIZE = 12
// the wheel travel that opens or closes the grid, so a trackpad's first few pixels do not
const WHEEL_PULL = 100

const round = css`
  display: grid;
  place-items: center;
  width: 4rem;
  height: 4rem;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.3);
  color: inherit;
  cursor: pointer;

  &:hover {
    background: rgba(40, 40, 40, 0.6);
  }
`

/* youtube.com's full screen view, measured at 1024 to 1920 px on 2026-11-10: the title 20 px bold on one line over
   the left 60%, the action pill 12 px from the right and 80 px up (just above the seek rail), the grid's arrow in the
   middle of the control row, and an open grid's first row 31.5% down the player with its arrow 60 px above it */
const style = css`
  display: contents;
  color: #ffffff;
  font-family: Roboto, Arial, sans-serif;

  .fs-top,
  .fs-actions,
  .fs-more {
    transition: opacity 0.2s ease;
  }

  &:not(.fs-shown) .fs-top,
  &:not(.fs-shown) .fs-actions,
  &:not(.fs-shown) .fs-more {
    opacity: 0;
    pointer-events: none;
  }

  .fs-top {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    padding: 2rem 2.4rem 4.8rem;
    background: linear-gradient(rgba(0, 0, 0, 0.5), transparent);
    pointer-events: none;
  }

  .fs-heading {
    max-width: 60%;
    margin: 0;
    overflow: hidden;
    font-size: 2rem;
    font-weight: 700;
    line-height: 2.8rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .fs-actions {
    position: absolute;
    right: 1.2rem;
    bottom: 8rem;
    display: flex;
    align-items: center;
    padding: 0.4rem;
    border-radius: 2.8rem;
    background: rgba(0, 0, 0, 0.3);
  }

  .fs-action {
    display: grid;
    place-items: center;
    width: 4.8rem;
    height: 3.2rem;
    padding: 0;
    border: none;
    border-radius: 1.6rem;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }

  .fs-action.fs-like {
    width: 3.2rem;
  }

  .fs-action:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .fs-action:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .fs-more {
    position: absolute;
    left: 50%;
    bottom: 0.8rem;
    margin-left: -2rem;
  }

  /* narrower, the controls' left groups with a chapter title at its 220 px reach the middle of the bar */
  @container player (max-width: 1080px) {
    .fs-more {
      display: none;
    }
  }

  .fs-sheet {
    position: absolute;
    inset: 0;
    background: linear-gradient(rgba(0, 0, 0, 0.3), rgba(0, 0, 0, 0.75) 31.5%, rgba(0, 0, 0, 0.85));
    animation: grid-in 0.2s ease;
  }

  @keyframes grid-in {
    from {
      opacity: 0;
      transform: translateY(4rem);
    }
  }

  .fs-hide {
    position: absolute;
    top: calc(31.5% - 6rem);
    left: 50%;
    margin-left: -2rem;
  }

  .fs-scroll {
    position: absolute;
    top: 31.5%;
    left: 0;
    right: 0;
    bottom: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .fs-list {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1.6rem;
    margin: 0;
    padding: 0 2.4rem 2.4rem;
    list-style: none;
  }

  .fs-card {
    display: flex;
    flex-direction: column;
    color: inherit;
    text-decoration: none;
  }

  .fs-thumb {
    position: relative;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    border-radius: 0.8rem;
    background: rgba(255, 255, 255, 0.1);
  }

  .fs-thumb img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .fs-duration {
    position: absolute;
    right: 0.4rem;
    bottom: 0.4rem;
    padding: 0 0.4rem;
    border-radius: 0.4rem;
    background: var(--bg-badge);
    font-size: 1.2rem;
    font-weight: 500;
    line-height: 1.8rem;
  }

  .fs-title {
    display: -webkit-box;
    margin: 1.2rem 0 0.4rem;
    overflow: hidden;
    font-size: 1.6rem;
    font-weight: 500;
    line-height: 2rem;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .fs-byline {
    font-size: 1.4rem;
    line-height: 2rem;
    color: rgba(255, 255, 255, 0.7);
  }
`

/**
 * youtube.com's full screen view, drawn over the player while its frame is full screen: the title, like, comments,
 * share and save, and the grid of more videos that the wheel, the arrow or v opens. `shown` is the controls' own
 * visibility, which the title and the buttons share.
 */
export const FullscreenView = ({ shown }: { shown: boolean }) => {
  const frame = useFrame()!
  const { details, grid, setGrid, comments, setComments } = frame
  const rootRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [sharing, setSharing] = useState(false)
  const { rate, rating } = useRateVideo(details.videoId, details.likeStatus)
  const latest = useRef({ grid, setGrid, sharing })
  latest.current = { grid, setGrid, sharing }

  // on the player rather than the sheet, so the wheel opens the grid from anywhere over the video
  useEffect(() => {
    const surface = rootRef.current?.parentElement
    if (!surface) return
    let pull = 0
    const onWheel = (event: WheelEvent) => {
      if ((event.target as Element).closest('[role="dialog"]')) return
      const { grid: open, setGrid: toggle } = latest.current
      const down = event.deltaY > 0
      // an open grid scrolls its list, and closes on a pull up from the list's top
      if (open && (down || (scrollRef.current?.scrollTop ?? 0) > 0)) return
      event.preventDefault()
      if (down === open) return
      pull = Math.sign(pull) === Math.sign(event.deltaY) ? pull + event.deltaY : event.deltaY
      if (Math.abs(pull) < WHEEL_PULL) return
      pull = 0
      toggle(!open)
    }
    surface.addEventListener('wheel', onWheel, { passive: false })
    return () => surface.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'v' || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return
      if (isTypingTarget(event.target) || latest.current.sharing) return
      event.preventDefault()
      latest.current.setGrid(!latest.current.grid)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const liked = details.likeStatus === 'LIKE'
  const disliked = details.likeStatus === 'DISLIKE'

  return (
    <div css={style} ref={rootRef} className={shown && !grid ? 'fs-shown' : undefined}>
      <div className='fs-top'>
        {details.title ? <h2 className='fs-heading'>{details.title}</h2> : undefined}
      </div>
      <div className='fs-actions'>
        <button
          type='button'
          className='fs-action fs-like'
          aria-label='Like'
          aria-pressed={liked}
          disabled={rating}
          onClick={() => rate('LIKE')}
        >
          <ThumbsUp size={20} strokeWidth={1.5} fill={liked ? 'currentColor' : 'none'} />
        </button>
        <button
          type='button'
          className='fs-action'
          aria-label='Dislike'
          aria-pressed={disliked}
          disabled={rating}
          onClick={() => rate('DISLIKE')}
        >
          <ThumbsDown size={20} strokeWidth={1.5} fill={disliked ? 'currentColor' : 'none'} />
        </button>
        {details.commentsHidden
          ? undefined
          : (
            <button type='button' className='fs-action' aria-label='Comments' aria-pressed={comments} onClick={() => setComments(!comments)}>
              <MessageSquareText size={20} strokeWidth={1.5} />
            </button>
          )}
        <button type='button' className='fs-action' aria-label='Share' onClick={() => setSharing(true)}>
          <Forward size={20} strokeWidth={1.5} />
        </button>
        {/* youtube.com keeps Save in a More actions menu beside Report, which yt-client does not have */}
        <SaveMenu
          videoId={details.videoId}
          trigger={
            <button type='button' className='fs-action' aria-label='Save'>
              <ListPlus size={20} strokeWidth={1.5} />
            </button>
          }
        />
      </div>
      <button type='button' css={round} className='fs-more' aria-label='More videos' onClick={() => setGrid(true)}>
        <ChevronUp size={24} strokeWidth={2} />
      </button>
      {grid
        ? (
          <div className='fs-sheet'>
            <button type='button' css={round} className='fs-hide' aria-label='Hide videos' onClick={() => setGrid(false)}>
              <ChevronDown size={24} strokeWidth={2} />
            </button>
            <div className='fs-scroll' ref={scrollRef}>
              <ul className='fs-list' aria-label='More videos'>
                {details.videos.slice(0, GRID_SIZE).map((video) => {
                  const duration = video.isLive ? 'LIVE' : formatDuration(video.durationSeconds)
                  const meta = formatMeta(video.viewCount, video.publishedText)
                  return (
                    <li key={video.id}>
                      <a className='fs-card' href={upNextHref(video)} onClick={openOnClick(video, details.onOpen)}>
                        <span className='fs-thumb'>
                          {video.thumbnail ? <Thumbnail src={video.thumbnail} srcSet={video.thumbnailSrcset} sizes='33vw' /> : undefined}
                          {duration ? <span className='fs-duration'>{duration}</span> : undefined}
                        </span>
                        <span className='fs-title'>{video.title}</span>
                        {video.channel ? <span className='fs-byline'>{video.channel.name}</span> : undefined}
                        {meta ? <span className='fs-byline'>{meta}</span> : undefined}
                      </a>
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>
        )
        : undefined}
      {sharing ? <ShareDialog videoId={details.videoId} list={details.list} onClose={() => setSharing(false)} /> : undefined}
    </div>
  )
}

const panelStyle = css`
  position: absolute;
  top: 1.6rem;
  right: 1.6rem;
  bottom: 1.6rem;
  width: 40rem;
  overflow: hidden;
  border-radius: 1.2rem;
  background: var(--bg-menu);
  color: var(--text-primary);

  .fs-close {
    position: absolute;
    top: 1.2rem;
    right: 0.8rem;
    z-index: 1;
    display: grid;
    place-items: center;
    width: 4rem;
    height: 4rem;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }

  .fs-close:hover {
    background: var(--bg-hover);
  }

  .fs-body {
    height: 100%;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 1.8rem 1.6rem 1.6rem;
  }

  .fs-body > section {
    margin-top: 0;
  }
`

/** The comments beside the video in full screen, as youtube.com's Comments button opens them. */
export const CommentsPanel = (
  { videoId, commentCountText, onClose }: { videoId: string, commentCountText?: string | null, onClose: () => void },
) => (
  <aside css={panelStyle} aria-label='Comments'>
    <button type='button' className='fs-close' aria-label='Close comments' onClick={onClose}>
      <X size={24} strokeWidth={1.5} />
    </button>
    <div className='fs-body'>
      <Comments videoId={videoId} commentCountText={commentCountText} />
    </div>
  </aside>
)
