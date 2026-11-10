import type { ComponentChildren } from 'preact'

import { css } from '@emotion/react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'preact/hooks'

const style = css`
  position: relative;

  .track {
    display: flex;
    gap: var(--rail-gap, 0.8rem);
    overflow-x: auto;
    scroll-behavior: smooth;
    /* The scrollbar is hidden because the arrows are the affordance; without
       them the overflow would be unreachable on a mouse-only desktop, which is
       why they are rendered rather than left to the trackpad. */
    scrollbar-width: none;
    scroll-snap-type: x proximity;
  }

  .track::-webkit-scrollbar {
    display: none;
  }

  .track > * {
    flex: none;
    scroll-snap-align: start;
  }

  .arrow {
    position: absolute;
    top: var(--rail-arrow-top, calc(50% - 6rem));
    display: flex;
    align-items: center;
    justify-content: center;
    width: 4rem;
    height: 4rem;
    border: none;
    border-radius: 50%;
    background: var(--bg-menu);
    color: var(--text-primary);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    cursor: pointer;
    z-index: 1;
  }

  .arrow.left {
    left: -2rem;
  }

  .arrow.right {
    right: var(--rail-arrow-right, -2rem);
  }

  /* Without the guide a page's gutter can be narrower than the overhang,
     which would scroll the whole page sideways. */
  @media (max-width: 792px) {
    .arrow.left {
      left: 0;
    }

    .arrow.right {
      right: 0;
    }
  }
`

// Roughly a screenful, so a click advances the rail rather than nudging it.
const SCROLL_BY = 0.8

/**
 * A horizontal row that scrolls by its arrows. `label` names the items in the
 * arrows' labels ("More shorts"), and `count` is how many there are, so the
 * arrows are measured again when the row grows. With `wholeCards` an arrow
 * moves the row by whole items, as many as its width holds rounded, at least
 * one: youtube.com's search carousels, measured from 512 to 735px on 2026-11-10.
 */
export const Rail = (
  { label, count, wholeCards = false, children }: { label: string, count: number, wholeCards?: boolean, children: ComponentChildren },
) => {
  const trackRef = useRef<HTMLDivElement>(null)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(false)

  useLayoutEffect(() => {
    const track = trackRef.current
    if (!track) return
    const measure = () => {
      const max = track.scrollWidth - track.clientWidth
      setAtStart(track.scrollLeft <= 1)
      setAtEnd(track.scrollLeft >= max - 1)
    }
    measure()
    track.addEventListener('scroll', measure, { passive: true })
    const observer = new ResizeObserver(measure)
    observer.observe(track)
    return () => {
      track.removeEventListener('scroll', measure)
      observer.disconnect()
    }
  }, [count])

  const scrollBy = (direction: 1 | -1) => {
    const track = trackRef.current
    if (!track) return
    const [first, second] = [...track.children] as HTMLElement[]
    const pitch = wholeCards && first && second ? second.offsetLeft - first.offsetLeft : 0
    const step = pitch > 0 ? Math.max(1, Math.round(track.clientWidth / pitch)) * pitch : track.clientWidth * SCROLL_BY
    track.scrollBy({ left: direction * step, behavior: 'smooth' })
  }

  return (
    <div css={style}>
      {!atStart
        ? (
          <button type='button' className='arrow left' aria-label={`Previous ${label}`} onClick={() => scrollBy(-1)}>
            <ChevronLeft size={24} strokeWidth={2} />
          </button>
        )
        : undefined}
      <div className='track' ref={trackRef}>
        {children}
      </div>
      {!atEnd
        ? (
          <button type='button' className='arrow right' aria-label={`More ${label}`} onClick={() => scrollBy(1)}>
            <ChevronRight size={24} strokeWidth={2} />
          </button>
        )
        : undefined}
    </div>
  )
}

export default Rail
