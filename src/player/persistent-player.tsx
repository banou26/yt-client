import type { UpNext } from './up-next'

import { css } from '@emotion/react'
import { X } from 'lucide-react'
import { createPortal } from 'preact/compat'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { useQuery } from 'urql'
import { Link, useLocation, useSearch } from 'wouter'

import { getSettings, subscribeSettings, updateSettings } from '../settings'
import { closePlayer, getPlayerSession, openPlayer, playerHost, registerPlayerDock, setTheater, usePlayerSession } from './session'
import { upNextHref } from './end-screen'
import { hasNextInQueue, markPlayed, nextQueueIndex, pickAutoplay } from './up-next'
import VideoPlayer from './video-player'
import { WATCH_META_QUERY } from './watch-query'

const style = css`
  /* The dock is always mounted so the player's DOM home has somewhere to live
     even before a route claims it. It only becomes VISIBLE once a video is
     playing and no route is showing it. */
  position: fixed;
  right: 1.6rem;
  bottom: 1.6rem;
  z-index: 60;
  width: 40rem;
  max-width: calc(100vw - 3.2rem);
  border-radius: 1.2rem;
  overflow: hidden;
  background: var(--bg-elevated, var(--bg-subtle));
  box-shadow: 0 4px 32px rgba(0, 0, 0, 0.4);

  &.hidden {
    /* Moved off-screen rather than hidden with display none: the player lives
       in here, and a display-none ancestor gives the video element a zero-sized
       box. Shaka's restrictToElementSize then filters every variant away and
       the next quality decision picks the floor. Off-screen, the element keeps
       its real dimensions. */
    position: fixed;
    left: -20000px;
    top: 0;
    right: auto;
    bottom: auto;
    width: 40rem;
    box-shadow: none;
    pointer-events: none;
  }

  .dock-slot {
    display: block;
  }

  .dock-meta {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    padding: 0.8rem 0.8rem 0.8rem 1.2rem;
  }

  .dock-title {
    flex: 1;
    min-width: 0;
    color: var(--text-primary);
    font-size: 1.3rem;
    font-weight: 500;
    line-height: 1.8rem;
    text-decoration: none;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .dock-close {
    flex: none;
    display: grid;
    place-items: center;
    width: 3.2rem;
    height: 3.2rem;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--text-primary);
    cursor: pointer;
  }

  .dock-close:hover {
    background: var(--bg-chip-hover);
  }
`

/**
 * The one player instance, mounted above the router.
 *
 * It renders into a detached host node that `claimPlayer` moves between a
 * route's own layout and this dock. Nothing here re-renders when the player
 * moves: the host node's identity never changes, so the portal below keeps
 * targeting the same container wherever that container has been moved to.
 *
 * Closing is an explicit action. Leaving the watch page is not one, which is
 * the difference between this and the old in-route player.
 */
const PersistentPlayer = () => {
  const session = usePlayerSession()
  const docked = Boolean(session.videoId) && !session.claimed
  const [location, navigate] = useLocation()
  const search = useSearch()
  const [autoplay, setAutoplay] = useState(() => getSettings().autoplay)
  useEffect(() => subscribeSettings(settings => setAutoplay(settings.autoplay)), [])

  const videoId = session.videoId
  // the same document and variables as the watch route, so on the watch page both share its one /next
  const [{ data }] = useQuery({
    query: WATCH_META_QUERY,
    variables: { id: videoId ?? '', playlistId: session.list, playlistIndex: session.index },
    pause: !videoId,
  })
  const watch = videoId !== undefined && data?.watch?.id === videoId ? data.watch : undefined

  useEffect(() => {
    if (videoId) markPlayed(videoId)
  }, [videoId])

  const playlist = session.list !== undefined && watch?.playlist?.id === session.list ? watch.playlist : undefined
  const count = playlist?.items.length ?? 0
  const current = Math.min(Math.max(playlist?.currentIndex ?? 0, 0), Math.max(count - 1, 0))
  // read when the video ends, since loop and shuffle change without re-rendering this
  const queued = () => playlist !== undefined && hasNextInQueue(current, count)

  const suggestions = useMemo<UpNext[]>(
    () => (watch?.related ?? []).filter(video => video.id !== videoId),
    [watch, videoId],
  )
  const pick = useMemo(() => (videoId ? pickAutoplay(suggestions, videoId) : undefined), [suggestions, videoId])

  // the watch page navigates; the miniplayer plays in place and leaves the page alone
  const open = (target: UpNext) => {
    if (getPlayerSession().claimed) {
      navigate(upNextHref(target))
      return
    }
    openPlayer({ videoId: target.id, title: target.title ?? undefined, list: target.list, index: target.index })
  }

  const queueTarget = () => {
    if (!playlist) return undefined
    const index = nextQueueIndex(current, count)
    const item = index === undefined ? undefined : playlist.items[index]
    return item ? { id: item.id, title: item.title, thumbnail: item.thumbnail, list: playlist.id, index } : undefined
  }

  // where i leaves the watch page for, as youtube.com returns to the page the video was opened from
  const lastPage = useRef('/')
  useEffect(() => {
    if (!location.startsWith('/watch')) lastPage.current = search ? `${location}?${search}` : location
  }, [location, search])
  const toggleMiniplayer = () => {
    const current = getPlayerSession()
    if (!current.videoId) return
    navigate(current.claimed ? lastPage.current : upNextHref({ id: current.videoId, list: current.list, index: current.index }))
  }

  const next = count > 1 || pick
    ? () => {
      const target = queueTarget() ?? pick
      if (target) open(target)
    }
    : undefined

  return (
    <>
      <aside css={style} className={docked ? undefined : 'hidden'} aria-hidden={!docked}>
        <div className='dock-slot' ref={registerPlayerDock} />
        {docked
          ? (
            <div className='dock-meta'>
              <Link
                className='dock-title'
                href={upNextHref({ id: session.videoId!, list: session.list, index: session.index })}
              >
                {session.title ?? 'Now playing'}
              </Link>
              <button type='button' className='dock-close' aria-label='Close miniplayer' onClick={closePlayer}>
                <X size={20} strokeWidth={1.5} />
              </button>
            </div>
          )
          : undefined}
      </aside>
      {createPortal(
        session.videoId
          ? (
            <VideoPlayer
              key={`player:${session.videoId}`}
              videoId={session.videoId}
              startAt={session.startAt}
              theater={session.theater}
              onTheater={() => setTheater(!session.theater)}
              onMiniplayer={toggleMiniplayer}
              upNext={{
                autoplay,
                onAutoplay: (value: boolean) => updateSettings({ autoplay: value }),
                queued,
                pick,
                suggestions,
                onNext: next,
                onOpen: open,
              }}
            />
          )
          : null,
        playerHost(),
      )}
    </>
  )
}

export default PersistentPlayer
