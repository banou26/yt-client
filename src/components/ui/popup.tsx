import type { ComponentChildren, FunctionComponent, RefObject } from 'preact'

import { css } from '@emotion/react'
import { createPortal } from 'preact/compat'
import { useEffect, useLayoutEffect } from 'preact/hooks'

/** `panelRef` is for a panel drawn outside `rootRef`, as an anchored Popup is: a press inside either keeps it open. */
export const useDismiss = (
  { open, onClose, rootRef, panelRef, triggerRef }: {
    open: boolean
    onClose: () => void
    rootRef: RefObject<HTMLElement | null>
    panelRef?: RefObject<HTMLElement | null>
    triggerRef?: RefObject<HTMLElement | null>
  },
) => {
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (rootRef.current?.contains(target) || panelRef?.current?.contains(target)) return
      onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      onClose()
      triggerRef?.current?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose, rootRef, panelRef, triggerRef])
}

const popupStyle = css`
  position: absolute;
  top: calc(100% + 0.8rem);
  min-width: 20rem;
  max-height: 70vh;
  padding: 0.8rem 0;
  overflow-y: auto;
  border-radius: 1.2rem;
  background: var(--bg-menu);
  box-shadow: var(--shadow-menu);
  z-index: var(--z-popup);

  &.align-end {
    right: 0;
  }

  &.align-start {
    left: 0;
  }

  /* as wide as its widest unbreakable row, like a panel in place, so a long title wraps rather than stretching the menu
     across the page */
  &.anchored {
    position: fixed;
    width: min-content;
  }
`

// youtube.com's gap between a menu and its button, in CSS pixels
const GAP = 8

const place = (panel: HTMLElement, anchor: HTMLElement, align: 'start' | 'end', side: 'below' | 'above') => {
  const button = anchor.getBoundingClientRect()
  const { clientWidth: width, clientHeight: height } = document.documentElement
  // scrollHeight is the whole list even while an earlier max-height cuts it short
  const wanted = Math.min(panel.scrollHeight, height * 0.7)
  const room = { below: height - button.bottom - GAP, above: button.top - GAP }
  const other = side === 'below' ? 'above' : 'below'
  const chosen = wanted <= room[side] ? side : wanted <= room[other] || room[other] > room[side] ? other : side
  panel.style.maxHeight = `${Math.max(Math.min(height * 0.7, room[chosen]), 0)}px`
  panel.style.top = chosen === 'below' ? `${button.bottom + GAP}px` : 'auto'
  panel.style.bottom = chosen === 'above' ? `${height - button.top + GAP}px` : 'auto'
  const startLeft = button.left
  const endLeft = button.right - panel.offsetWidth
  const left = align === 'start'
    ? (startLeft + panel.offsetWidth <= width ? startLeft : endLeft)
    : (endLeft >= 0 ? endLeft : startLeft)
  panel.style.left = `${Math.max(GAP, Math.min(left, width - panel.offsetWidth - GAP))}px`
}

/**
 * A menu panel. Without `anchor` it sits in place under its positioned parent, lined up with its `align` edge.
 *
 * With `anchor` it is drawn on document.body at a fixed position, so no scrolling row can clip it or scroll to it: it
 * opens on `side` of the anchor unless only the other side has the room, lines its `align` edge up with the anchor's
 * unless that leaves the viewport, keeps 8px from the viewport's sides, and follows the anchor as anything scrolls or
 * resizes. Being on the body, it takes the page's palette rather than the one around the anchor, as youtube.com's menus
 * do. `onKeyDown` is there because a key pressed in it no longer reaches the anchor's ancestors.
 */
export const Popup = (
  { align = 'end', side = 'below', anchor, panelRef, onKeyDown, label, children, class: className }: {
    align?: 'start' | 'end'
    side?: 'below' | 'above'
    anchor?: RefObject<HTMLElement | null>
    panelRef?: RefObject<HTMLDivElement | null>
    onKeyDown?: (event: KeyboardEvent) => void
    label: string
    children: ComponentChildren
    class?: string
  },
) => {
  useLayoutEffect(() => {
    const panel = panelRef?.current
    const trigger = anchor?.current
    if (!panel || !trigger) return
    place(panel, trigger, align, side)
    let frame: number | undefined
    const update = () => {
      if (frame !== undefined) return
      frame = requestAnimationFrame(() => {
        frame = undefined
        place(panel, trigger, align, side)
      })
    }
    // capture, because a scroll of the row or of any other box does not bubble
    window.addEventListener('scroll', update, { capture: true, passive: true })
    window.addEventListener('resize', update)
    const observer = new ResizeObserver(update)
    observer.observe(panel)
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', update, { capture: true })
      window.removeEventListener('resize', update)
      observer.disconnect()
    }
  }, [anchor, panelRef, align, side])

  const panel = (
    <div
      css={popupStyle}
      className={[anchor ? 'anchored' : `align-${align}`, className].filter(part => part !== undefined).join(' ')}
      ref={panelRef}
      role='menu'
      aria-label={label}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  )
  return anchor ? createPortal(panel, document.body) : panel
}

const itemStyle = css`
  width: 100%;
  min-height: 4rem;
  display: flex;
  align-items: center;
  gap: 1.6rem;
  padding: 0 1.6rem;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 1.4rem;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease;

  &:hover:not(:disabled),
  &:focus-visible {
    background: var(--bg-hover);
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .label {
    flex: 1;
    min-width: 0;
  }

  .detail {
    color: var(--text-secondary);
  }
`

export const MenuItem = (
  { icon: Icon, detail, disabled, selected, onSelect, children }: {
    icon?: FunctionComponent<{ size?: number, strokeWidth?: number }>
    detail?: string
    disabled?: boolean
    selected?: boolean
    onSelect?: () => void
    children: ComponentChildren
  },
) => (
  <button
    type='button'
    css={itemStyle}
    role='menuitem'
    aria-checked={selected}
    disabled={disabled}
    onClick={onSelect}
  >
    {Icon ? <Icon size={20} strokeWidth={1.5} /> : undefined}
    <span className='label'>{children}</span>
    {detail ? <span className='detail'>{detail}</span> : undefined}
  </button>
)

const dividerStyle = css`
  height: 1px;
  margin: 0.8rem 0;
  background: var(--border-subtle);
`

export const MenuDivider = () => <div css={dividerStyle} role='separator' />
