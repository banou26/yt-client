import type { PlayerChapter } from '../player/chapters'
import type { RichTextRun } from './rich-text'

import { css } from '@emotion/react'
import { useLayoutEffect, useRef, useState } from 'preact/hooks'
import { Link } from 'wouter'

import { seekTo } from '../player/seek'
import { ChapterCards } from './chapters'
import { descriptionMeta } from './format'
import { RichText } from './rich-text'

const LINES = 3
const MORE_GAP = 4
const FADE = 24

const style = css`
  margin-top: 1.2rem;
  padding: 1.2rem;
  border-radius: 1.2rem;
  background: var(--bg-hover);
  font-size: 1.4rem;
  line-height: 2rem;
  color: var(--text-primary);
  transition: background 0.15s ease;

  &.collapsed {
    cursor: pointer;
  }

  &.collapsed:hover {
    background: var(--bg-hover-strong);
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    column-gap: 0.8rem;
    font-weight: 500;
    overflow-wrap: anywhere;
  }

  .counts {
    white-space: pre-wrap;
  }

  .hashtag {
    color: var(--text-secondary);
  }

  .snippet {
    position: relative;
  }

  .text {
    display: block;
    white-space: pre-wrap;
    word-break: break-word;
  }

  /* Three lines, cut by height rather than a line clamp: a clamp draws its own
     ellipsis on the last kept line, which is a lone one when that line is blank.
     The mask hides the last line from where the inline button starts, fading
     the text it cuts, so it reads on the translucent box in either theme. */
  &.collapsed .text {
    max-height: 6rem;
    overflow: hidden;
    mask-image:
      linear-gradient(to top, transparent 2rem, #000 2rem),
      linear-gradient(to right, #000 var(--fade-from, 0), transparent var(--more-left, 0));
  }

  .more {
    position: absolute;
    left: var(--more-left, auto);
    bottom: 0;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font: inherit;
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
  }

  .chapters {
    padding-top: 1.6rem;
  }

  .chapters-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1.2rem;
    margin-bottom: 0.4rem;
  }

  .chapters-heading {
    font-size: 2rem;
    font-weight: 700;
    line-height: 2.8rem;
  }

  .view-all {
    flex: none;
    height: 4rem;
    padding: 0 1.5rem;
    border: 1px solid var(--border-subtle);
    border-radius: 2rem;
    background: transparent;
    color: var(--text-primary);
    font: inherit;
    font-weight: 500;
    cursor: pointer;
  }

  .view-all:hover {
    background: var(--bg-hover);
  }

  .less {
    display: block;
    margin-top: 1.6rem;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font: inherit;
    font-weight: 500;
    cursor: pointer;
  }
`

// youtube.com's inline ...more: right after the text of the last line shown, or at the end of that line, over its faded text, when the line is full
const placeMore = (snippet: HTMLElement) => {
  const text = snippet.querySelector<HTMLElement>('.text')
  const more = snippet.querySelector<HTMLElement>('.more')
  if (!text || !more) return
  const box = text.getBoundingClientRect()
  const lineHeight = Number.parseFloat(getComputedStyle(text).lineHeight)
  const lines = Math.max(1, Math.min(LINES, Math.round(text.scrollHeight / lineHeight)))
  const lineTop = box.top + (lines - 1) * lineHeight
  const range = document.createRange()
  range.selectNodeContents(text)
  const end = Math.max(0, ...[...range.getClientRects()]
    .filter(rect => rect.width > 0 && rect.top + rect.height / 2 >= lineTop && rect.top + rect.height / 2 < lineTop + lineHeight)
    .map(rect => rect.right - box.left))
  const last = box.width - more.offsetWidth
  const left = Math.min(end + MORE_GAP, last)
  snippet.style.setProperty('--more-left', `${left}px`)
  snippet.style.setProperty('--fade-from', `${left < end + MORE_GAP ? left - FADE : left}px`)
}

export const DescriptionBox = (
  {
    viewCountText, publishedDateText, shortViewCountText, relativeDateText, hashtags = [],
    description, runs, videoId, chapters = [], currentChapter = -1, onViewChapters,
  }: {
    viewCountText?: string | null
    publishedDateText?: string | null
    shortViewCountText?: string | null
    relativeDateText?: string | null
    hashtags?: readonly string[]
    description?: string | null
    runs?: readonly RichTextRun[]
    videoId?: string
    chapters?: readonly PlayerChapter[]
    currentChapter?: number
    onViewChapters?: () => void
  },
) => {
  const [expanded, setExpanded] = useState(false)
  const snippetRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const snippet = snippetRef.current
    if (expanded || !snippet) return
    const place = () => placeMore(snippet)
    place()
    // a box of fixed height and width does not resize when the web font swaps in and the lines rewrap
    void document.fonts.ready.then(place)
    const observer = new ResizeObserver(place)
    observer.observe(snippet)
    return () => observer.disconnect()
  }, [expanded, description, runs])
  const counts = descriptionMeta({ expanded, viewCountText, shortViewCountText, publishedDateText, relativeDateText })
  return (
    <div
      css={style}
      className={expanded ? undefined : 'collapsed'}
      onClick={expanded ? undefined : () => setExpanded(true)}
    >
      {counts || hashtags.length > 0
        ? (
          <div className='meta'>
            {counts ? <span className='counts'>{counts}</span> : undefined}
            {hashtags.map(tag => (
              <Link key={tag} className='hashtag' href={`/results?${new URLSearchParams({ search_query: tag })}`}>{tag}</Link>
            ))}
          </div>
        )
        : undefined}
      {description
        ? (
          <div className='snippet' ref={snippetRef}>
            {runs && runs.length > 0
              ? <RichText className='text' runs={runs} videoId={videoId} />
              : <div className='text'>{description}</div>}
            {expanded ? undefined : <button type='button' className='more'>...more</button>}
          </div>
        )
        : undefined}
      {expanded && videoId && chapters.length > 0
        ? (
          <section className='chapters' aria-label='Chapters'>
            <div className='chapters-head'>
              <h2 className='chapters-heading'>Chapters</h2>
              {onViewChapters
                ? (
                  <button
                    type='button'
                    className='view-all'
                    onClick={() => {
                      onViewChapters()
                      scrollTo({ top: 0 })
                    }}
                  >
                    View all
                  </button>
                )
                : undefined}
            </div>
            <ChapterCards
              videoId={videoId}
              chapters={chapters}
              current={currentChapter}
              onSeek={(seconds: number) => {
                seekTo(videoId, seconds)
                scrollTo({ top: 0 })
              }}
            />
          </section>
        )
        : undefined}
      {description && expanded
        ? <button type='button' className='less' onClick={() => setExpanded(false)}>Show less</button>
        : undefined}
    </div>
  )
}

export default DescriptionBox
