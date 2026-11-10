import type { ComponentChildren, RefObject } from 'preact'

import type { PlayerChapter } from '../player/chapters'

import { css } from '@emotion/react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'preact/hooks'
import { Link } from 'wouter'

import { cardState } from '../player/card-params'
import { clock } from '../player/controls'
import { seekTo } from '../player/seek'
import { Rail } from './rail'
import { SidePanel } from './side-panel'
import { watchHrefFor } from './video-card'

// youtube.com's time pill, shared by the list and the cards
const timePill = css`
  display: inline-block;
  border-radius: 0.2rem;
  background: var(--accent-tint);
  color: var(--accent);
  font-size: 1.2rem;
  line-height: 1.8rem;
  font-variant-numeric: tabular-nums;
`

const rowsStyle = css`
  position: relative;
  flex: 1;
  min-height: 0;
  padding: 0.8rem 0;
  overflow-y: auto;

  .chapter-row {
    display: flex;
    align-items: center;
    gap: 1.6rem;
    width: 100%;
    padding: 0.8rem 1.6rem;
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .chapter-row:hover,
  .chapter-row[aria-current='true'] {
    background: var(--bg-hover);
  }

  .chapter-thumb {
    flex: none;
    width: 10rem;
    height: 5.6rem;
    border-radius: 0.8rem;
    background: #000;
    object-fit: cover;
  }

  .chapter-details {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    min-width: 0;
  }

  .chapter-name {
    margin-bottom: 0.8rem;
    font-size: 1.4rem;
    font-weight: 500;
    line-height: 2rem;
  }

  .chapter-time {
    ${timePill}
    padding: 0.2rem 0.6rem;
    font-weight: 500;
  }
`

/**
 * The chapter list youtube.com opens from the player's chapter title, in a `SidePanel`. A row seeks to its chapter.
 */
export const ChaptersPanel = (
  { videoId, chapters, current, heading = 'Chapters', chips, onClose, overlay = false, fit }: {
    videoId: string
    chapters: readonly PlayerChapter[]
    current: number
    heading?: string
    chips?: ComponentChildren
    onClose: () => void
    overlay?: boolean
    fit?: RefObject<HTMLElement | null>
  },
) => {
  const itemsRef = useRef<HTMLDivElement>(null)
  // opens on the chapter playing, at the top of the list
  useLayoutEffect(() => {
    const items = itemsRef.current
    const row = items?.children[current] as HTMLElement | undefined
    if (items && row) items.scrollTop = row.offsetTop - Number.parseFloat(getComputedStyle(items).paddingTop)
  }, [])
  return (
    <SidePanel label='Chapters' heading={heading} chips={chips} onClose={onClose} overlay={overlay} fit={fit} className='chapters-panel'>
      <div css={rowsStyle} className='chapter-rows' ref={itemsRef}>
        {chapters.map((chapter, index) => (
          <button
            type='button'
            key={`${index}:${chapter.startSeconds}`}
            className='chapter-row'
            aria-current={index === current ? 'true' : undefined}
            onClick={() => seekTo(videoId, chapter.startSeconds)}
          >
            {chapter.thumbnail ? <img className='chapter-thumb' src={chapter.thumbnail} alt='' loading='lazy' /> : <span className='chapter-thumb' />}
            <span className='chapter-details'>
              <span className='chapter-name'>{chapter.title}</span>
              <span className='chapter-time'>{clock(chapter.startSeconds)}</span>
            </span>
          </button>
        ))}
      </div>
    </SidePanel>
  )
}

// a 15.6 rem card holding a 15 rem still, 1.2 rem apart, which the line through the time pills crosses
const cardsStyle = css`
  --rail-gap: 1.2rem;
  --rail-arrow-top: 5.8rem;

  .card {
    position: relative;
    display: block;
    width: 15.6rem;
    padding: 0.4rem 0.3rem 0.2rem;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .card-thumb {
    display: block;
    width: 15rem;
    height: 8.5rem;
    overflow: hidden;
    border-radius: 0.8rem;
    background: #000;
  }

  .card[aria-current='true'] .card-thumb {
    border: 2px solid var(--accent);
  }

  .card-thumb img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .card-details {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding: 0.8rem 0.4rem 0;
  }

  /* from this card's pill to the next one's, under both */
  .card:not(:last-child) .card-details::before {
    content: '';
    position: absolute;
    top: 1.6rem;
    left: 0.4rem;
    right: -2.2rem;
    height: 0.2rem;
    background: var(--accent-tint);
  }

  .card-time {
    ${timePill}
    position: relative;
    margin-bottom: 0.8rem;
    padding: 0 0.4rem;
  }

  .card-title {
    display: -webkit-box;
    overflow: hidden;
    font-size: 1.4rem;
    font-weight: 500;
    line-height: 2rem;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
`

const startHref = (videoId: string, seconds: number) =>
  seconds > 0 ? `${watchHrefFor(videoId)}&t=${Math.floor(seconds)}s` : watchHrefFor(videoId)

/**
 * youtube.com's row of chapter cards. With `onSeek` a card seeks the video playing, as in its description; without,
 * it opens the video at the chapter, as on a search row.
 */
export const ChapterCards = (
  { videoId, chapters, current = -1, onSeek, playerParams }: {
    videoId: string
    chapters: readonly PlayerChapter[]
    current?: number
    onSeek?: (seconds: number) => void
    playerParams?: string
  },
) => (
  <div css={cardsStyle}>
    <Rail label='chapters' count={chapters.length}>
      {chapters.map((chapter, index) => {
        const body = (
          <>
            <span className='card-thumb'>{chapter.thumbnail ? <img src={chapter.thumbnail} alt='' loading='lazy' /> : undefined}</span>
            <span className='card-details'>
              <span className='card-time'>{clock(chapter.startSeconds)}</span>
              <span className='card-title'>{chapter.title}</span>
            </span>
          </>
        )
        const key = `${index}:${chapter.startSeconds}`
        return onSeek
          ? (
            <button
              type='button'
              key={key}
              className='card'
              aria-current={index === current ? 'true' : undefined}
              onClick={() => onSeek(chapter.startSeconds)}
            >
              {body}
            </button>
          )
          : <Link key={key} className='card' href={startHref(videoId, chapter.startSeconds)} state={cardState(playerParams)}>{body}</Link>
      })}
    </Rail>
  </div>
)

const stripStyle = css`
  margin-top: 1.2rem;
  border-radius: 0.8rem;
  background: var(--bg-chip);
  color: var(--text-primary);

  .strip-head {
    display: flex;
    align-items: center;
    gap: 1.2rem;
    width: 100%;
    min-height: 3.6rem;
    padding: 0.4rem 1.2rem 0.4rem 0.8rem;
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 1.2rem;
    line-height: 1.8rem;
    text-align: left;
    cursor: pointer;
  }

  .strip-thumb {
    flex: none;
    width: 5.2rem;
    height: 2.8rem;
    border-radius: 0.4rem;
    object-fit: cover;
  }

  .strip-text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .strip-count {
    margin-right: 0.6rem;
    font-weight: 500;
  }

  .strip-names {
    color: var(--text-secondary);
  }

  .strip-head svg {
    flex: none;
  }

  &.open {
    padding-bottom: 0.8rem;
  }

  &.open .strip-head {
    padding: 0.4rem 0.4rem 0.4rem 1.6rem;
    font-size: 1.4rem;
    line-height: 2rem;
    color: var(--text-secondary);
  }

  .strip-toggle {
    display: grid;
    flex: none;
    place-items: center;
    width: 4rem;
    height: 4rem;
    border-radius: 50%;
    background: var(--bg-chip-hover);
    color: var(--text-primary);
  }

  &.open .cards {
    padding: 0 1.6rem;
  }
`

/** A search row's chapters: their count and names on one line, which opens on their cards. */
export const ChapterStrip = (
  { videoId, chapters, title, playerParams }: {
    videoId: string
    chapters: readonly PlayerChapter[]
    title?: string | null
    playerParams?: string
  },
) => {
  const [open, setOpen] = useState(false)
  if (open) {
    return (
      <div css={stripStyle} className='open'>
        <button type='button' className='strip-head' aria-expanded='true' onClick={() => setOpen(false)}>
          <span className='strip-text'>{title ?? `${chapters.length} chapters in this video`}</span>
          <span className='strip-toggle'><ChevronUp size={24} strokeWidth={1.5} /></span>
        </button>
        <div className='cards'>
          <ChapterCards videoId={videoId} chapters={chapters} playerParams={playerParams} />
        </div>
      </div>
    )
  }
  const still = chapters[0]?.thumbnail
  return (
    <div css={stripStyle}>
      <button type='button' className='strip-head' aria-expanded='false' onClick={() => setOpen(true)}>
        {still ? <img className='strip-thumb' src={still} alt='' loading='lazy' /> : undefined}
        <span className='strip-text'>
          <span className='strip-count'>{`${chapters.length} chapters`}</span>
          <span className='strip-names'>{chapters.map(chapter => chapter.title).join(' | ')}</span>
        </span>
        <ChevronDown size={24} strokeWidth={1.5} />
      </button>
    </div>
  )
}
