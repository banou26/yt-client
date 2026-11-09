import type { ComponentChildren } from 'preact'

import type { LikeStatus, WatchMetaQuery } from '../generated/graphql'
import type { UpNext } from './up-next'

import { css } from '@emotion/react'
import { createContext } from 'preact'
import { useContext, useEffect, useRef, useState } from 'preact/hooks'

type RelatedVideo = NonNullable<WatchMetaQuery['watch']>['related'][number]

/** What the full screen view shows of the video playing, from the persistent player's read of it. */
export type FrameDetails = {
  videoId: string
  list?: string
  title?: string
  likeStatus?: LikeStatus | null
  commentsHidden: boolean
  commentCountText?: string | null
  /** The related list, the current video left out: the grid shows its first 12, as youtube.com's does. */
  videos: readonly RelatedVideo[]
  onOpen: (target: UpNext) => void
}

type FullscreenModule = typeof import('./fullscreen-view')

type Frame = {
  details: FrameDetails
  fullscreen: boolean
  grid: boolean
  setGrid: (open: boolean) => void
  comments: boolean
  setComments: (open: boolean) => void
  view?: FullscreenModule
}

const FrameContext = createContext<Frame | undefined>(undefined)

export const useFrame = () => useContext(FrameContext)

// the view's code (comments, share and save) is fetched on the first full screen, so none of it weighs on the entry
let loading: Promise<FullscreenModule> | undefined

const frameStyle = css`
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border-radius: 14px;
  background: #000;
  position: relative;

  /* Fullscreen has to beat BOTH the 16/9 aspect-ratio box and the max-height
     that theater mode puts on this element, or the video is letterboxed inside
     a correctly-fullscreened container. Sizing off the viewport rather than
     100%/100% also survives whatever the ancestor grid was doing. */
  &:fullscreen {
    width: 100vw;
    height: 100vh;
    max-width: none;
    max-height: none;
    aspect-ratio: auto;
    border-radius: 0;
  }

  /* above the view's like and share buttons, which take this corner in full screen */
  &:fullscreen .sponsor-skip {
    bottom: 13.2rem;
  }

  /* youtube.com's comments sit beside the video 16 px from the edges, with the player narrowed to the rest (measured
     2026-11-10). Theirs are 320 px wide; these are 400, the room a full count like '2,461,151 Comments' and Sort by
     take on one line */
  &.with-comments > [data-player-surface] {
    right: 43.2rem;
  }
`

/**
 * The player's box, and the element that goes full screen.
 *
 * It stays mounted while the video inside it changes, so a video picked in full screen plays without leaving it. In
 * full screen it carries the view's state: the grid of more videos and the comments beside the video, both closed
 * when the video changes or full screen ends.
 */
export const PlayerFrame = ({ details, children }: { details: FrameDetails, children: ComponentChildren }) => {
  const ref = useRef<HTMLDivElement>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [grid, setGrid] = useState(false)
  const [comments, setComments] = useState(false)
  const [view, setView] = useState<FullscreenModule | undefined>(undefined)

  useEffect(() => {
    const sync = () => {
      const on = document.fullscreenElement !== null && document.fullscreenElement === ref.current
      setFullscreen(on)
      if (on) return
      setGrid(false)
      setComments(false)
    }
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])

  useEffect(() => {
    setGrid(false)
    setComments(false)
  }, [details.videoId])

  // @fkn/lib passes a wheel inside its frame's bounds on to the scroller under the pointer, which in full screen is the
  // hidden page (measured 2026-11-10), and leaving full screen then lands that far down plus the player's height
  useEffect(() => {
    if (!fullscreen) return
    const top = scrollY
    const hold = () => {
      if (document.fullscreenElement && scrollY !== top) scrollTo(scrollX, top)
    }
    addEventListener('scroll', hold)
    return () => removeEventListener('scroll', hold)
  }, [fullscreen])

  useEffect(() => {
    if (!fullscreen || view) return
    let live = true
    loading ??= import('./fullscreen-view')
    loading.then(
      (module) => {
        if (live) setView(module)
      },
      () => {
        loading = undefined
      },
    )
    return () => {
      live = false
    }
  }, [fullscreen])

  const panel = fullscreen && comments && !details.commentsHidden

  return (
    <div css={frameStyle} data-player-root ref={ref} className={panel ? 'with-comments' : undefined}>
      <FrameContext.Provider value={{ details, fullscreen, grid, setGrid, comments, setComments, view }}>
        {children}
        {panel && view
          ? (
            <view.CommentsPanel
              key={details.videoId}
              videoId={details.videoId}
              commentCountText={details.commentCountText}
              onClose={() => setComments(false)}
            />
          )
          : undefined}
      </FrameContext.Provider>
    </div>
  )
}
