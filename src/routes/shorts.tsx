import type { ShortsFeedQuery } from '../generated/graphql'

import { css } from '@emotion/react'
import { ChevronDown, ChevronUp, MessageCircle, MonitorPlay, MoreVertical, Share2, ThumbsDown, ThumbsUp, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { useMutation, useQuery } from 'urql'
import { Link, useLocation, useRoute } from 'wouter'

import { useDocumentTitle } from '../app'
import { Comments } from '../components/comments'
import { readable, safeDecode } from '../components/format'
import ShareDialog from '../components/share-dialog'
import SubscribeButton from '../components/subscribe-button'
import { Menu, MenuItem } from '../components/ui/menu'
import useInfiniteFeed from '../components/use-infinite-feed'
import { gql } from '../generated'
import { isTypingTarget } from '../player/controls'
import ShortsPlayer from '../player/shorts-player'
import { closePlayer } from '../player/session'
import { useSession } from '../session'

const SHORTS_FEED_QUERY = gql(`
  query ShortsFeed($seed: ID, $cursor: String) {
    shorts(seed: $seed, cursor: $cursor) {
      items { id poster title }
      cursor
    }
  }
`)

const SHORT_META_QUERY = gql(`
  query ShortMeta($id: ID!) {
    watch(id: $id) {
      id
      title
      viewCountText
      likeCountText
      commentCountText
      likeStatus
      channel { id name avatar handle isSubscribed notificationLevel }
    }
  }
`)

const RATE_SHORT = gql(`
  mutation RateShort($id: ID!, $status: LikeStatus!) {
    rateVideo(id: $id, status: $status) {
      id
      likeStatus
      likeCountText
    }
  }
`)

type ShortsPage = ShortsFeedQuery['shorts']

const style = css`
  /* Owns the viewport below the header: the pager scrolls itself rather than
     the document, so snapping is not fighting the page's own scroll. */
  height: calc(100vh - var(--header-height));
  overflow-y: auto;
  overflow-x: hidden;
  scroll-snap-type: y mandatory;
  overscroll-behavior-y: contain;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }

  .slide {
    height: 100%;
    scroll-snap-align: center;
    scroll-snap-stop: always;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1.6rem;
    padding: 1.2rem 0;
  }

  /* A Short's video and its buttons, positioned so that below the breakpoint
     the buttons sit on that Short's video. */
  .reel {
    position: relative;
    display: flex;
    gap: 1.6rem;
    height: 100%;
    /* The cap is on the HEIGHT, and the video's width follows from its aspect
       ratio. Capping the width instead leaves height at 100% and the box stops
       being 9:16 at all: on a tall viewport it became 460x1165 and cropped the
       sides off every short. */
    max-height: calc(46rem * 16 / 9);
    max-width: 100%;
    flex: none;
  }

  /* The 9:16 box IS the player element, so the quality the player asks for is
     derived from the size the video is actually shown at. Sizing the element to
     the whole slide and letterboxing inside it would make it request a stream
     far larger than any pixel on screen. */
  .stage {
    position: relative;
    height: 100%;
    aspect-ratio: 9 / 16;
    max-width: 100%;
    flex: none;
  }

  .rail {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    gap: 1.6rem;
    padding-bottom: 1.2rem;
  }

  .rail-button {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 1.2rem;
    font-weight: 500;
    cursor: pointer;
  }

  .rail-button .glyph {
    display: grid;
    place-items: center;
    width: 4.8rem;
    height: 4.8rem;
    border-radius: 50%;
    background: var(--bg-subtle);
    transition: background 0.15s ease;
  }

  .rail-button:hover .glyph {
    background: var(--bg-hover, var(--border-subtle));
  }

  .rail-button.on .glyph {
    color: var(--accent);
  }

  .meta {
    position: absolute;
    inset: auto 0 0 0;
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
    padding: 4.8rem 1.6rem 2.4rem;
    /* The scrubber owns the bottom edge, so this overlay must not swallow the
       pointer before it gets there. */
    pointer-events: none;
    background: linear-gradient(transparent, rgba(0, 0, 0, 0.75));
    color: #fff;
  }

  .meta a,
  .meta button {
    pointer-events: auto;
  }

  .byline {
    display: flex;
    align-items: center;
    gap: 0.8rem;
  }

  .byline img {
    width: 3.2rem;
    height: 3.2rem;
    border-radius: 50%;
  }

  .byline .name {
    color: #fff;
    font-size: 1.4rem;
    font-weight: 700;
    text-decoration: none;
  }

  .short-title {
    margin: 0;
    font-size: 1.4rem;
    font-weight: 500;
    line-height: 1.9rem;
    /* Two lines, the way the Shorts overlay clamps: a long title otherwise
       covers the video it belongs to. */
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .views {
    margin: 0;
    font-size: 1.2rem;
    color: rgba(255, 255, 255, 0.8);
  }

  .comments-panel {
    position: relative;
    display: flex;
    flex-direction: column;
    width: 42rem;
    max-width: 100%;
    height: 100%;
    border-radius: 1.2rem;
    background: var(--bg-elevated, var(--bg-subtle));
    overflow: hidden;
  }

  .comments-scrim {
    display: none;
  }

  .comments-panel header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.6rem;
    border-bottom: 1px solid var(--border-subtle);
    font-size: 1.6rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .comments-panel .body {
    flex: 1;
    overflow-y: auto;
    padding: 0 1.6rem 1.6rem;
  }

  .icon-button {
    display: grid;
    place-items: center;
    width: 4rem;
    height: 4rem;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--text-primary);
    cursor: pointer;
  }

  .notice,
  .empty {
    display: grid;
    place-items: center;
    height: 100%;
    padding: 2.4rem;
    color: var(--text-secondary);
    font-size: 1.4rem;
    text-align: center;
  }

  .empty h2 {
    margin: 0;
    color: var(--text-primary);
    font-size: 2rem;
  }

  /* Fixed to the viewport's right edge, where youtube.com keeps them, rather
     than to a slide: the pager scrolls under them. */
  .pager {
    position: fixed;
    right: 2.4rem;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    flex-direction: column;
    gap: 1.6rem;
    z-index: 2;
  }

  .pager button {
    display: grid;
    place-items: center;
    width: 5.6rem;
    height: 5.6rem;
    border: none;
    border-radius: 50%;
    background: var(--bg-subtle);
    color: var(--text-primary);
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .pager button:hover:not(:disabled) {
    background: var(--bg-hover, var(--border-subtle));
  }

  .pager button:disabled {
    visibility: hidden;
  }

  /* With the comments open, the slide reaches under the pager below this
     width, which would cover the comments. Measured 2026-11-02 with the stage
     at its height cap: up to 1192px under the mini guide, and up to 1360px
     under the expanded guide that starts at 1313px. */
  @media (max-width: 1440px) {
    &.comments-open .pager {
      display: none;
    }
  }

  @media (max-width: 900px) {
    .rail {
      /* Below the breakpoint the rail sits on top of the video, which is where
         it lives on a phone anyway. */
      position: absolute;
      right: 0.8rem;
      bottom: 5.6rem;
      padding: 0;
      z-index: 1;
    }

    .meta {
      padding-right: 8rem;
    }

    .rail-button {
      color: #fff;
      text-shadow: 0 1px 3px rgba(0, 0, 0, 0.7);
    }

    .rail-button .glyph {
      background: rgba(0, 0, 0, 0.5);
      color: #fff;
    }

    .pager {
      display: none;
    }

    /* A sheet over the Short, as youtube.com opens it at this width (measured
       2026-11-10): about three quarters of the height below the header, at
       most 48rem wide, closed by a tap beside it. */
    .comments-scrim {
      display: block;
      position: fixed;
      inset: 0;
      z-index: var(--z-dialog);
      background: var(--bg-scrim);
    }

    .comments-panel {
      position: fixed;
      inset: calc(var(--header-height) + 11%) 0 10%;
      z-index: var(--z-dialog);
      width: auto;
      max-width: 48rem;
      height: auto;
      margin: 0 auto;
    }
  }
`

/**
 * One slide.
 *
 * Split out so the metadata query is scoped to the slide and unmounts with it:
 * a hook on the parent would have to key on the active id and would keep every
 * visited slide's data alive for the life of the route.
 */
const Slide = (
  { id, poster, fallbackTitle, active, onComments, onShare, onRefused }: {
    id: string
    poster?: string | null
    fallbackTitle?: string | null
    active: boolean
    onComments: () => void
    onShare: () => void
    onRefused?: () => void
  },
) => {
  const [, navigate] = useLocation()
  const [rateState, rate] = useMutation(RATE_SHORT)
  const [{ data }] = useQuery({
    query: SHORT_META_QUERY,
    variables: { id },
    pause: !active,
  })
  const meta = data?.watch
  const liked = meta?.likeStatus === 'LIKE'
  const disliked = meta?.likeStatus === 'DISLIKE'

  const onRate = (status: 'LIKE' | 'DISLIKE') => {
    if (!meta || rateState.fetching) return
    const next = meta.likeStatus === status ? 'INDIFFERENT' : status
    void rate({ id, status: next })
  }

  return (
    <div className='reel'>
      <div className='stage'>
        <ShortsPlayer videoId={id} poster={poster ?? undefined} active={active} onRefused={onRefused} />
        <div className='meta'>
          <div className='byline'>
            {meta?.channel?.avatar
              ? <img src={meta.channel.avatar} alt='' loading='lazy' />
              : undefined}
            {meta?.channel
              ? <Link className='name' href={`/channel/${meta.channel.id}`}>{meta.channel.name}</Link>
              : undefined}
            <SubscribeButton
              channelId={meta?.channel?.id}
              subscribed={meta?.channel?.isSubscribed}
              notificationLevel={meta?.channel?.notificationLevel}
            />
          </div>
          <p className='short-title'>{meta?.title ?? fallbackTitle ?? ''}</p>
          {meta?.viewCountText ? <p className='views'>{meta.viewCountText}</p> : undefined}
        </div>
      </div>
      <div className='rail'>
        <button
          type='button'
          className={liked ? 'rail-button on' : 'rail-button'}
          aria-pressed={liked}
          aria-label='Like'
          onClick={() => onRate('LIKE')}
        >
          <span className='glyph'><ThumbsUp size={24} strokeWidth={1.5} fill={liked ? 'currentColor' : 'none'} /></span>
          {meta?.likeCountText ?? 'Like'}
        </button>
        <button
          type='button'
          className={disliked ? 'rail-button on' : 'rail-button'}
          aria-pressed={disliked}
          aria-label='Dislike'
          onClick={() => onRate('DISLIKE')}
        >
          <span className='glyph'><ThumbsDown size={24} strokeWidth={1.5} fill={disliked ? 'currentColor' : 'none'} /></span>
          Dislike
        </button>
        <button type='button' className='rail-button' aria-label='Comments' onClick={onComments}>
          <span className='glyph'><MessageCircle size={24} strokeWidth={1.5} /></span>
          {meta?.commentCountText ?? 'Comments'}
        </button>
        <button type='button' className='rail-button' onClick={onShare}>
          <span className='glyph'><Share2 size={24} strokeWidth={1.5} /></span>
          Share
        </button>
        <Menu
          label='More actions'
          align='start'
          // the rail ends at the bottom of the video, so its menu opens upwards
          side='above'
          trigger={
            <button type='button' className='rail-button' aria-label='More actions'>
              <span className='glyph'><MoreVertical size={24} strokeWidth={1.5} /></span>
            </button>
          }
        >
          <MenuItem
            icon={MonitorPlay}
            label='Open in the full player'
            onSelect={() => navigate(`/watch?v=${encodeURIComponent(id)}`)}
          />
        </Menu>
      </div>
    </div>
  )
}

const ShortsPage = () => {
  const [, params] = useRoute('/shorts/:videoId')
  // frozen at mount: re-reading the param would refetch the whole sequence on every path rewrite the pager makes
  const [seed] = useState(() => (params?.videoId ? safeDecode(params.videoId) : undefined))
  const { ready } = useSession()
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [loaded, setLoaded] = useState<ShortsPage[]>([])
  const [activeId, setActiveId] = useState<string | undefined>(seed)
  const [showComments, setShowComments] = useState(false)
  const [sharing, setSharing] = useState<string | undefined>(undefined)
  const [refused, setRefused] = useState<ReadonlySet<string>>(() => new Set())

  const [{ data, error, fetching }] = useQuery({
    query: SHORTS_FEED_QUERY,
    variables: { seed, cursor: loaded[loaded.length - 1]?.cursor },
    pause: !ready,
  })
  const page = data?.shorts
  const { items: feed } = useInfiniteFeed({
    pages: page ? [...loaded, page] : loaded,
    key: short => short.id,
  })
  // a Short the address named stays to say why it does not play; any other YouTube refuses is passed over
  const items = feed.filter(short => short.id === seed || !refused.has(short.id))

  useDocumentTitle('Shorts')

  // the persistent player survives route changes, so leaving it alive would play two videos at once
  useEffect(() => closePlayer(), [])

  const onMore = useCallback(() => {
    if (!page?.cursor || fetching || error) return
    setLoaded(previous => previous[previous.length - 1] === page ? previous : [...previous, page])
  }, [page, fetching, error])

  useEffect(() => {
    if (!activeId && items[0]) setActiveId(items[0].id)
  }, [items, activeId])

  // the threshold MUST stay over half, so exactly one slide can qualify and two players can never be live
  useEffect(() => {
    const root = scrollerRef.current
    if (!root) return
    const observer = new IntersectionObserver(
      entries => {
        const visible = entries
          .filter(entry => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        const id = (visible?.target as HTMLElement | undefined)?.dataset.shortId
        if (id) setActiveId(id)
      },
      { root, threshold: 0.6 },
    )
    for (const node of root.querySelectorAll('[data-short-id]')) observer.observe(node)
    return () => observer.disconnect()
  }, [items.length])

  useEffect(() => {
    const index = items.findIndex(short => short.id === activeId)
    if (index >= 0 && index >= items.length - 3) onMore()
  }, [activeId, items, onMore])

  useEffect(() => {
    if (!activeId) return
    const next = `/shorts/${encodeURIComponent(activeId)}`
    if (location.pathname !== next) history.replaceState(null, '', next)
  }, [activeId])

  const active = useMemo(() => items.find(short => short.id === activeId), [items, activeId])

  const activeIndex = items.findIndex(short => short.id === activeId)
  const step = (by: 1 | -1) => {
    const target = items[activeIndex + by]
    if (!target) return
    scrollerRef.current?.querySelector(`[data-short-id="${CSS.escape(target.id)}"]`)?.scrollIntoView({ behavior: 'smooth' })
  }

  const latest = useRef({ step, sharing })
  latest.current = { step, sharing }

  // on the document, so the keys work before anything on the page has been clicked
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
      if (isTypingTarget(event.target) || latest.current.sharing) return
      event.preventDefault()
      latest.current.step(event.key === 'ArrowDown' ? 1 : -1)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  if (!ready || (fetching && items.length === 0)) {
    return <main css={style}><p className='notice'>Loading Shorts…</p></main>
  }

  if (error && items.length === 0) {
    return <main css={style}><p className='notice'>{readable(error.message)}</p></main>
  }

  if (items.length === 0) {
    return (
      <main css={style}>
        <div className='empty'>
          <h2>No Shorts right now</h2>
        </div>
      </main>
    )
  }

  return (
    <main css={style} className={showComments ? 'comments-open' : undefined} ref={scrollerRef}>
      {items.map(short => (
        <section className='slide' key={short.id} data-short-id={short.id}>
          <Slide
            id={short.id}
            poster={short.poster}
            fallbackTitle={short.title}
            active={short.id === activeId}
            onComments={() => setShowComments(value => !value)}
            onShare={() => setSharing(short.id)}
            onRefused={short.id === seed ? undefined : () => setRefused(previous => new Set(previous).add(short.id))}
          />
          {showComments && short.id === activeId
            ? (
              <>
                <div className='comments-scrim' onClick={() => setShowComments(false)} />
                <aside className='comments-panel' aria-label='Comments'>
                  <header>
                    Comments
                    <button type='button' className='icon-button' aria-label='Close comments' onClick={() => setShowComments(false)}>
                      <X size={24} strokeWidth={1.5} />
                    </button>
                  </header>
                  <div className='body'>
                    <Comments videoId={short.id} />
                  </div>
                </aside>
              </>
            )
            : undefined}
        </section>
      ))}
      {sharing ? <ShareDialog videoId={sharing} onClose={() => setSharing(undefined)} /> : undefined}
      {active === undefined && fetching ? <p className='notice'>Loading more…</p> : undefined}
      <div className='pager'>
        <button type='button' aria-label='Previous short' disabled={activeIndex <= 0} onClick={() => step(-1)}>
          <ChevronUp size={24} strokeWidth={1.5} />
        </button>
        <button type='button' aria-label='Next short' disabled={activeIndex >= items.length - 1} onClick={() => step(1)}>
          <ChevronDown size={24} strokeWidth={1.5} />
        </button>
      </div>
    </main>
  )
}

export default ShortsPage
