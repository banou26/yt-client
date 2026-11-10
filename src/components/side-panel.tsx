import type { ComponentChildren, RefObject } from 'preact'

import { css } from '@emotion/react'
import { X } from 'lucide-react'
import { useLayoutEffect, useRef } from 'preact/hooks'

const style = css`
  position: relative;
  flex: none;
  display: flex;
  flex-direction: column;
  max-height: 48rem;
  margin-bottom: 0.8rem;
  border: 1px solid var(--border);
  border-radius: 1.2rem;
  background: var(--bg-base);
  color: var(--text-primary);
  overflow: hidden;

  .panel-head {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 5.6rem;
    padding: 0.4rem 0.4rem 0.4rem 1.6rem;
    border-bottom: 1px solid var(--border);
  }

  .panel-heading {
    font-size: 2rem;
    font-weight: 700;
    line-height: 2.8rem;
  }

  .panel-close {
    display: grid;
    place-items: center;
    width: 4rem;
    height: 4rem;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }

  .panel-close:hover {
    background: var(--bg-hover);
  }

  .panel-chips {
    flex: none;
    display: flex;
    gap: 0.8rem;
    padding: 0.8rem 1.2rem;
  }

  .panel-chip {
    height: 3.2rem;
    padding: 0 1.2rem;
    border: none;
    border-radius: 0.8rem;
    background: var(--bg-chip);
    color: var(--text-primary);
    font-size: 1.4rem;
    font-weight: 500;
    line-height: 2rem;
    cursor: pointer;
  }

  .panel-chip:hover {
    background: var(--bg-chip-hover);
  }

  .panel-chip[aria-selected='true'] {
    background: var(--bg-inverse);
    color: var(--text-inverse);
  }

  /* in full screen the list fills the slot beside the video that the player's frame keeps */
  &.overlay {
    height: 100%;
    max-height: none;
    margin: 0;
  }
`

/**
 * The frame of a list youtube.com opens beside the player: a heading, an optional row of chips that switch between
 * lists, a close button, and the list itself. With `fit`, the frame is as tall as that element, as youtube.com's is
 * beside the player; with `overlay`, it is drawn over the right of a full screen player.
 */
export const SidePanel = (
  { label, heading, chips, onClose, overlay = false, fit, className, children }: {
    label: string
    heading: string
    chips?: ComponentChildren
    onClose: () => void
    overlay?: boolean
    fit?: RefObject<HTMLElement | null>
    className: string
    children: ComponentChildren
  },
) => {
  const panelRef = useRef<HTMLElement>(null)
  // set on the element rather than rendered, so that a list scrolled on mount already sees the final box
  useLayoutEffect(() => {
    const panel = panelRef.current
    const target = fit?.current
    if (!panel || !target) return
    const match = () => {
      panel.style.height = `${target.offsetHeight}px`
      panel.style.maxHeight = 'none'
    }
    match()
    const observer = new ResizeObserver(match)
    observer.observe(target)
    return () => {
      observer.disconnect()
      panel.style.height = ''
      panel.style.maxHeight = ''
    }
  }, [fit])
  return (
    <section css={style} ref={panelRef} className={overlay ? `${className} overlay` : className} aria-label={label}>
      <div className='panel-head'>
        <h2 className='panel-heading'>{heading}</h2>
        <button type='button' className='panel-close' aria-label='Close' onClick={onClose}>
          <X size={24} strokeWidth={1.5} />
        </button>
      </div>
      {chips ? <div className='panel-chips' role='tablist'>{chips}</div> : undefined}
      {children}
    </section>
  )
}
