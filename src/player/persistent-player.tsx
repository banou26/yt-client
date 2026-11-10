import type { UpNext } from './up-next'

import { css } from '@emotion/react'
import { createPortal } from 'preact/compat'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { useQuery } from 'urql'
import { Link, useLocation, useSearch } from 'wouter'

import { getSettings, subscribeSettings, updateSettings } from '../settings'
import { getPlayerSession, openPlayer, playerHost, registerPlayerDock, setTheater, usePlayerSession } from './session'
import { upNextHref } from './end-screen'
import { PlayerFrame } from './player-frame'
import { useSponsorSegments } from './sponsorblock'
import { hasNextInQueue, markPlayed, nextQueueIndex, pickAutoplay, previousQueueIndex } from './up-next'
import VideoPlayer from './video-player'
import { descriptionOf, WATCH_META_QUERY } from './watch-query'

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
  background: var(--bg-subtle);
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.16), 0 3px 6px rgba(0, 0, 0, 0.2);

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

  /* above the lines under it, which the knob overhangs as on youtube.com */
  .dock-slot {
    position: relative;
    z-index: 1;
  }

  /* youtube.com's miniplayer has none of the player bar's groups, only its seek bar, drawn all the time along the
     bottom edge of the video, 3 px tall */
  .dock-slot [data-player-root] {
    border-radius: 0;
    overflow: visible;
  }

  .dock-slot .bar {
    display: none;
  }

  .dock-slot div:has(> .scrubber) {
    padding: 0;
    opacity: 1;
    pointer-events: auto;
  }

  .dock-slot .scrubber {
    padding-bottom: 0;
  }

  .dock-slot .rail {
    height: 0.3rem;
  }

  /* youtube.com's miniplayer names no chapter under the frame its seek bar shows */
  .preview-chapter {
    display: none;
  }

  .dock-meta {
    height: 7.6rem;
    padding: 1.2rem 1.6rem;
  }

  .dock-title,
  .dock-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dock-title {
    display: block;
    color: var(--text-primary);
    font-size: 1.4rem;
    font-weight: 500;
    line-height: 2rem;
    text-decoration: none;
  }

  .dock-byline {
    display: flex;
    margin-top: 0.4rem;
    color: var(--text-secondary);
    font-size: 1.2rem;
    line-height: 1.8rem;
  }

  .dock-index {
    flex: none;
  }

  .dock-index::before {
    content: '•';
    margin: 0 0.4rem;
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
  const segments = useSponsorSegments(watch && !watch.isLive ? watch.id : undefined)

  useEffect(() => {
    if (videoId) markPlayed(videoId)
  }, [videoId])

  const playlist = session.list !== undefined && watch?.playlist?.id === session.list ? watch.playlist : undefined
  const count = playlist?.items.length ?? 0
  const current = Math.min(Math.max(playlist?.currentIndex ?? 0, 0), Math.max(count - 1, 0))
  // read when the video ends, since loop and shuffle change without re-rendering this
  const queued = () => playlist !== undefined && hasNextInQueue(current, count)

  const suggestions = useMemo(
    () => (watch?.related ?? []).filter(video => video.id !== videoId),
    [watch, videoId],
  )
  const preferred = watch?.autoplayId
  const pick = useMemo(
    () => (videoId ? pickAutoplay(suggestions, videoId, { preferred }) : undefined),
    [suggestions, videoId, preferred],
  )

  // the page a full screen player left behind, since a navigation would move the player out of full screen
  const behind = useRef<string | undefined>(undefined)

  // the watch page navigates; the miniplayer, and the watch page in full screen, play in place and leave the page alone
  const open = (target: UpNext) => {
    if (getPlayerSession().claimed) {
      if (!document.fullscreenElement) {
        navigate(upNextHref(target))
        return
      }
      behind.current ??= `${window.location.pathname}${window.location.search}`
    }
    openPlayer({ videoId: target.id, title: target.title ?? undefined, list: target.list, index: target.index })
  }

  // once full screen ends, the watch page catches up with the video played in it, unless the page moved on meanwhile
  useEffect(() => {
    const follow = () => {
      if (document.fullscreenElement) return
      const left = behind.current
      behind.current = undefined
      const current = getPlayerSession()
      if (left !== `${window.location.pathname}${window.location.search}` || !current.videoId || !current.claimed) return
      if (new URLSearchParams(window.location.search).get('v') === current.videoId) return
      navigate(upNextHref({ id: current.videoId, list: current.list, index: current.index }))
    }
    document.addEventListener('fullscreenchange', follow)
    return () => document.removeEventListener('fullscreenchange', follow)
  }, [navigate])

  const queueEntry = (index: number | undefined) => {
    const item = index === undefined ? undefined : playlist?.items[index]
    return item && playlist ? { id: item.id, title: item.title, thumbnail: item.thumbnail, list: playlist.id, index } : undefined
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
      const target = queueEntry(nextQueueIndex(current, count)) ?? pick
      if (target) open(target)
    }
    : undefined

  // youtube.com's Shift+P steps back through a playlist only, and does nothing on its first entry or outside one
  const previous = playlist
    ? () => {
      const target = queueEntry(previousQueueIndex(current, count))
      if (target) open(target)
    }
    : undefined

  return (
    <>
      <aside css={style} className={docked ? undefined : 'hidden'} aria-label='Miniplayer' aria-hidden={!docked}>
        <div className='dock-slot' ref={registerPlayerDock} />
        {docked
          ? (
            <div className='dock-meta'>
              <Link
                className='dock-title'
                href={upNextHref({ id: session.videoId!, list: session.list, index: session.index })}
              >
                {watch?.title ?? session.title ?? 'Now playing'}
              </Link>
              {/* youtube.com names the playlist and the place in it where it would name the channel */}
              {playlist || watch?.channel?.name
                ? (
                  <div className='dock-byline'>
                    <span className='dock-name'>{playlist ? playlist.title ?? 'Playlist' : watch?.channel?.name}</span>
                    {playlist && count > 0 ? <span className='dock-index'>{current + 1} / {count}</span> : undefined}
                  </div>
                )
                : undefined}
            </div>
          )
          : undefined}
      </aside>
      {createPortal(
        session.videoId
          ? (
            <PlayerFrame
              details={{
                videoId: session.videoId,
                list: session.list,
                title: watch?.title ?? session.title,
                likeStatus: watch?.likeStatus,
                commentsHidden: watch?.commentsHidden === true,
                commentCountText: watch?.commentCountText,
                videos: suggestions,
                onOpen: open,
                chapters: watch?.chapters ?? [],
                chapter: session.chapter,
                panel: session.panel,
                transcript: watch?.transcriptPanel ?? undefined,
                description: watch ? descriptionOf(watch) : undefined,
              }}
            >
              <VideoPlayer
                key={`player:${session.videoId}`}
                videoId={session.videoId}
                playerParams={session.playerParams}
                list={session.list}
                title={session.title}
                startAt={session.startAt}
                docked={docked}
                theater={session.theater}
                onTheater={() => setTheater(!session.theater)}
                onMiniplayer={toggleMiniplayer}
                chapters={watch?.chapters}
                segments={segments}
                teasers={watch?.cardTeasers}
                cardsAvatar={watch?.channelCard?.avatar}
                upNext={{
                  autoplay,
                  onAutoplay: (value: boolean) => updateSettings({ autoplay: value }),
                  queued,
                  pick,
                  suggestions,
                  onNext: next,
                  onPrevious: previous,
                  onOpen: open,
                }}
              />
            </PlayerFrame>
          )
          : null,
        playerHost(),
      )}
    </>
  )
}

export default PersistentPlayer
