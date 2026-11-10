import type { ComponentChildren } from 'preact'

import { css } from '@emotion/react'
import { useLayoutEffect, useRef, useState } from 'preact/hooks'

const style = css`
  .clamped {
    display: -webkit-box;
    -webkit-line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .read-more {
    display: block;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: 1.4rem;
    font-weight: 500;
    line-height: 2rem;
    cursor: pointer;
  }
`

/**
 * `children` cut at four lines, as youtube.com cuts a comment and a post, with a Read more under them only when they
 * run past. It opens them in place and turns into Show less. `className` goes on the box that is cut, and `text` is
 * the plain text `children` draw, which decides when the cut is measured again.
 */
export const ReadMore = (
  { className, text, children }: { className?: string, text: string, children: ComponentChildren },
) => {
  const [expanded, setExpanded] = useState(false)
  const [overflowing, setOverflowing] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const element = ref.current
    if (expanded || !element) return
    const check = () => setOverflowing(element.scrollHeight > element.clientHeight + 1)
    check()
    // a clamped box keeps its height when the web font swaps in and the lines rewrap
    void document.fonts.ready.then(check)
    const observer = new ResizeObserver(check)
    observer.observe(element)
    return () => observer.disconnect()
  }, [expanded, text])
  return (
    <div css={style}>
      <div ref={ref} className={[className, expanded ? undefined : 'clamped'].filter(Boolean).join(' ')}>
        {children}
      </div>
      {expanded || overflowing
        ? (
          <button type='button' className='read-more' onClick={() => setExpanded(value => !value)}>
            {expanded ? 'Show less' : 'Read more'}
          </button>
        )
        : undefined}
    </div>
  )
}
