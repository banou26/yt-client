import type { TargetedPointerEvent } from 'preact'

import type { Channel, SavePlaylistsQuery, Video } from '../generated/graphql'
import type { CollaborationData } from './byline'

import { css } from '@emotion/react'
import { Check, ChevronLeft, Clock, EllipsisVertical, ListPlus, Share2 } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'preact/hooks'
import { useMutation, useQuery } from 'urql'
import { Link } from 'wouter'

// reuses save-menu.tsx's documents rather than a second gql() copy: two operations cannot share a name
import { AddToPlaylistDocument, SavePlaylistsDocument } from '../generated/graphql'
import { HoverPreview } from '../player/hover-preview'
import { shortsLink } from '../player/links'
import { usePrefetchOnIntent } from '../player/prefetch'
import { useSession } from '../session'
import { AvatarStack, BylineNames, CollaboratorsButton } from './byline'
import { formatDuration, readable, rowByline } from './format'
import { WATCH_LATER_ID } from './playlist'
import { CornerBadge, MembersOnly, MusicNote, RowMeta, ShortsMark } from './row-marks'
import { shortsHrefFor } from './shorts-shelf'
import { Thumbnail } from './thumbnail'
import { Menu, MenuItem, MenuSeparator } from './ui/menu'
import { showToast } from './ui/toast'
import { useInfiniteFeed } from './use-infinite-feed'
import { VerifiedBadge } from './verified-badge'
import { signIn } from '../sign-in'

export type VideoCardData =
  Pick<Video, 'id' | 'title'>
  & Partial<
    Pick<
      Video,
      | 'animatedThumbnail'
      | 'description'
      | 'durationSeconds'
      | 'isMembersOnly'
      | 'isMusic'
      | 'metaDelimiter'
      | 'progressPercent'
      | 'publishedText'
      | 'thumbnail'
      | 'thumbnailBadge'
      | 'thumbnailSrcset'
      | 'viewCount'
      | 'viewCountIcon'
    >
  >
  & {
    isLive?: boolean | null
    isShort?: boolean | null
    isUpcoming?: boolean | null
    channel?: (Pick<Channel, 'id' | 'name'> & Partial<Pick<Channel, 'avatar' | 'isVerified' | 'isVerifiedArtist'>>) | null
  }
  & CollaborationData

/**
 * The playlist a link is being followed from, so /watch opens the queue the
 * reader was already looking at instead of the video on its own.
 *
 * `index` is 1-based, matching PlaylistItem.index and upstream's own links. It
 * is optional even when `list` is set: the server resolves the position from
 * the video id, and a list that has shifted since the page was rendered would
 * otherwise open on the wrong row.
 */
export type WatchContext = { list?: string, index?: number }

export const watchHrefFor = (videoId: string, context?: WatchContext) => {
  const params = new URLSearchParams({ v: videoId })
  if (context?.list !== undefined && context.list.length > 0) {
    params.set('list', context.list)
    if (context.index !== undefined && Number.isFinite(context.index)) {
      params.set('index', String(context.index))
    }
  }
  return `/watch?${params}`
}

// upstream progress is a rounded percentage that can read slightly over 100
export const resumePercent = (progressPercent?: number | null) =>
  progressPercent !== undefined && progressPercent !== null && progressPercent > 0
    ? Math.min(progressPercent, 100)
    : undefined

type PlaylistsPage = SavePlaylistsQuery['playlists']

const menuPanelStyle = css`
  min-width: 24rem;
`

type CardMenuView = 'root' | 'playlists'

/**
 * The card overflow menu's contents.
 *
 * Split from the trigger because Menu mounts its children only while the panel
 * is open, and a feed renders dozens of cards: the session probe, the library
 * query and the mutation all live here so a closed menu costs nothing but the
 * button. The one thing that has to outlive the panel is which playlists this
 * video has already been put into, so that state sits with the trigger.
 */
const CardMenuPanel = (
  { videoId, short, saved, onSaved }: {
    videoId: string
    short: boolean
    saved: string[]
    onSaved: (playlistId: string) => void
  },
) => {
  const { ready, signedIn } = useSession()
  const [view, setView] = useState<CardMenuView>('root')
  const [wanted, setWanted] = useState(false)
  const [loaded, setLoaded] = useState<PlaylistsPage[]>([])
  const [pending, setPending] = useState<string | undefined>(undefined)
  const panelRef = useRef<HTMLDivElement>(null)
  // Menu moves focus onto a row only when the panel OPENS, so this covers the swap
  const shown = useRef(view)

  useLayoutEffect(() => {
    if (shown.current === view) return
    shown.current = view
    panelRef.current?.querySelector<HTMLElement>('[role="menuitem"], [role="menuitemcheckbox"]')?.focus()
  }, [view])

  const [{ data, error, fetching }] = useQuery({
    query: SavePlaylistsDocument,
    variables: { cursor: loaded[loaded.length - 1]?.cursor },
    pause: !wanted || !ready || !signedIn,
  })
  const [, addToPlaylist] = useMutation(AddToPlaylistDocument)

  const page = data?.playlists
  const { items, cursor } = useInfiniteFeed({
    pages: page ? [...loaded, page] : loaded,
    key: playlist => playlist.id,
  })
  const rows = items.filter(playlist => playlist.id !== WATCH_LATER_ID)

  const onMore = () => {
    if (!page?.cursor || fetching || error) return
    setLoaded(loaded[loaded.length - 1] === page ? loaded : [...loaded, page])
  }

  const save = (playlistId: string, label: string) => {
    if (pending !== undefined || saved.includes(playlistId)) return
    setPending(playlistId)
    void addToPlaylist({ playlistId, videoIds: [videoId] }).then((result) => {
      setPending(undefined)
      if (result.error) {
        showToast(readable(result.error.message))
        return
      }
      onSaved(playlistId)
      showToast(`Saved to ${label}`)
    })
  }

  const onShare = () => {
    // deliberately without the playlist context: a shared link opens the video, not a queue
    const url = short ? shortsLink(location.origin, videoId) : `${location.origin}${watchHrefFor(videoId)}`
    const clipboard = navigator.clipboard
    if (!clipboard) {
      showToast('Could not copy the link')
      return
    }
    void clipboard.writeText(url).then(
      () => showToast('Link copied to clipboard'),
      () => showToast('Could not copy the link'),
    )
  }

  const savedWatchLater = saved.includes(WATCH_LATER_ID)

  return (
    <div css={menuPanelStyle} role='presentation' ref={panelRef}>
      {view === 'root'
        ? (
          <>
            <MenuItem
              icon={savedWatchLater ? Check : Clock}
              label={savedWatchLater ? 'Saved to Watch later' : 'Save to Watch later'}
              disabled={!ready || pending !== undefined || savedWatchLater}
              onSelect={() => {
                if (!signedIn) {
                  signIn()
                  return
                }
                save(WATCH_LATER_ID, 'Watch later')
              }}
            />
            <MenuItem
              icon={ListPlus}
              label='Save to playlist'
              disabled={!ready}
              closeOnSelect={false}
              onSelect={() => {
                if (!signedIn) {
                  signIn()
                  return
                }
                setWanted(true)
                setView('playlists')
              }}
            />
            <MenuSeparator />
            <MenuItem icon={Share2} label='Share' onSelect={onShare} />
          </>
        )
        : (
          <>
            <MenuItem icon={ChevronLeft} label='Back' closeOnSelect={false} onSelect={() => setView('root')} />
            <MenuSeparator />
            {/* No visibility icon: SavePlaylists cannot select a privacy without writing nulls over the cached entity */}
            {rows.map(playlist => (
              <MenuItem
                key={playlist.id}
                label={playlist.title}
                detail={playlist.videoCountText ?? undefined}
                checked={saved.includes(playlist.id)}
                disabled={pending !== undefined || saved.includes(playlist.id)}
                onSelect={() => save(playlist.id, playlist.title)}
              />
            ))}
            {fetching && rows.length === 0 ? <MenuItem label='Loading…' disabled /> : undefined}
            {error && rows.length === 0 ? <MenuItem label={readable(error.message)} disabled /> : undefined}
            {!fetching && !error && rows.length === 0
              ? <MenuItem label='No playlists yet' disabled />
              : undefined}
            {cursor
              ? (
                <MenuItem
                  label={fetching ? 'Loading more…' : 'Show more'}
                  disabled={fetching || Boolean(error)}
                  closeOnSelect={false}
                  onSelect={onMore}
                />
              )
              : undefined}
          </>
        )}
    </div>
  )
}

/**
 * The overflow menu both card layouts hang off their `.more` button.
 *
 * `iconSize` is the only thing that differs between them: the compact card's
 * button is 2.4rem where the grid card's is 3.6rem, and an icon sized for one
 * looks wrong in the other. A Shorts tile sets `short`, so Share copies a /shorts/ link as youtube.com's does.
 */
export const VideoCardMenu = (
  { videoId, title, iconSize = 20, short = false, class: className }: {
    videoId: string
    title: string
    iconSize?: number
    short?: boolean
    class?: string
  },
) => {
  const [saved, setSaved] = useState<string[]>([])

  return (
    <Menu
      class={className}
      label={`More actions for ${title}`}
      // youtube.com opens a card's menu rightwards from the button, and leftwards only where that leaves the viewport
      align='start'
      trigger={
        <button type='button' className='more' aria-label={`More actions for ${title}`}>
          <EllipsisVertical size={iconSize} strokeWidth={1.5} />
        </button>
      }
    >
      <CardMenuPanel
        videoId={videoId}
        short={short}
        saved={saved}
        onSaved={(playlistId: string) => setSaved(ids => ids.includes(playlistId) ? ids : [...ids, playlistId])}
      />
    </Menu>
  )
}

const style = css`
  display: flex;
  flex-direction: column;
  min-width: 0;

  .thumb {
    position: relative;
    display: block;
    aspect-ratio: 16 / 9;
    border-radius: 1.2rem;
    overflow: hidden;
    background: var(--bg-elevated);
  }

  /* The card does NOT grow on hover. It used to, matching upstream's 4% lift,
     with an elevated surface behind the whole card so the grown thumbnail did
     not read as a picture that had outgrown its own caption. Both are gone by
     request: the preview now arrives inside a thumbnail that stays exactly
     where it was, so nothing under the pointer moves while the reader aims. */

  /* Shorts are vertical, and a 16/9 box would letterbox one into a slot mostly
     made of background. The card keeps its grid column and only the thumbnail
     changes shape, so the surrounding layout is untouched. */
  &.short .thumb {
    aspect-ratio: 9 / 16;
  }

  .thumb img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .badge {
    position: absolute;
    right: 0.6rem;
    bottom: 0.6rem;
    display: flex;
    align-items: center;
    gap: 0.2rem;
    padding: 0.1rem 0.4rem;
    border-radius: 0.4rem;
    background: var(--bg-badge);
    color: var(--text-on-media);
    font-size: 1.2rem;
    font-weight: 500;
    line-height: 1.8rem;
  }

  .badge.live {
    background: var(--brand);
    text-transform: uppercase;
  }

  .progress {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    display: block;
    height: 0.4rem;
    background: var(--bg-scrim);
  }

  .progress span {
    display: block;
    height: 100%;
    background: var(--brand);
  }

  .details {
    display: flex;
    align-items: flex-start;
    margin-top: 1.2rem;
  }

  .avatar {
    flex: none;
    width: 3.6rem;
    height: 3.6rem;
    border-radius: 50%;
    overflow: hidden;
    background: var(--bg-chip);
  }

  .avatar img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .avatar.fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-primary);
    font-size: 1.6rem;
    font-weight: 500;
  }

  .avatars {
    --avatar-size: 2.4rem;
    flex: none;
    margin-top: 0.6rem;
  }

  .text {
    flex: 1;
    min-width: 0;
    margin-left: 1.2rem;
  }

  .title {
    margin: 0 0 0.4rem;
    font-size: 1.6rem;
    font-weight: 500;
    line-height: 2.2rem;
    color: var(--text-primary);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .channel-name {
    display: block;
    width: fit-content;
    font-size: 1.4rem;
    font-weight: 400;
    color: var(--text-secondary);
    transition: color 0.15s ease;
  }

  .channel-name:hover {
    color: var(--text-primary);
  }

  /* a collaboration's names stay on one line, cut as youtube.com cuts them */
  .names {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .meta {
    font-size: 1.4rem;
    font-weight: 400;
    color: var(--text-secondary);
  }

  .members-only {
    margin-top: 0.2rem;
  }

  &.channel .text,
  &.shelf .text {
    margin-left: 0;
  }

  &.channel .title,
  &.shelf .title {
    font-size: 1.4rem;
    line-height: 2rem;
  }

  &.channel .meta,
  &.shelf .meta,
  &.channel .channel-name,
  &.shelf .channel-name {
    font-size: 1.2rem;
  }

  /* A search carousel's card on youtube.com keeps the avatar at the smaller
     type: measured signed out at 1280px, 2026-11-10. */
  &.carousel .details {
    margin-top: 0.8rem;
  }

  &.carousel .text {
    margin-left: 0.8rem;
  }

  &.carousel .title {
    font-size: 1.4rem;
    line-height: 2rem;
  }

  &.carousel .meta,
  &.carousel .channel-name {
    font-size: 1.2rem;
    line-height: 1.8rem;
  }

  .more {
    flex: none;
    width: 3.6rem;
    height: 3.6rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--text-primary);
    cursor: pointer;
    opacity: 0;
    transition: background 0.15s ease, opacity 0.15s ease;
  }

  /* The third selector keeps the trigger of an OPEN menu on screen: the pointer
     has moved onto the panel by then, so the card is no longer hovered and the
     button would fade out from under its own menu. */
  &:hover .more,
  .more:focus-visible,
  .more-menu[data-open] .more {
    opacity: 1;
  }

  .more:hover {
    background: var(--bg-hover);
  }
`

export const VideoCard = (
  { video, variant, context }: { video: VideoCardData, variant?: 'channel' | 'shelf' | 'carousel', context?: WatchContext },
) => {
  // youtube.com's search carousel keeps a Short's 16:9 card, marks it and opens it in the Shorts player
  const carouselShort = variant === 'carousel' && video.isShort === true
  const watchHref = carouselShort ? shortsHrefFor(video.id) : watchHrefFor(video.id, context)
  const channelHref = video.channel ? `/channel/${video.channel.id}` : undefined
  const byline = rowByline(video, variant === 'channel')
  const duration = formatDuration(video.durationSeconds)
  const progress = resumePercent(video.progressPercent)
  const prefetch = usePrefetchOnIntent(video.id)
  const [previewing, setPreviewing] = useState(false)
  const classes = [variant, video.isShort && !carouselShort ? 'short' : undefined]
    .filter(Boolean)
    .join(' ')
  const canPreview = video.isUpcoming !== true && video.isLive !== true
  const avatar = variant === undefined || variant === 'carousel'
  return (
    <article
      css={style}
      className={classes || undefined}
      /* Called through rather than spread: `{...prefetch}` lets the handlers below overwrite the hook's own. */
      onPointerEnter={(event: TargetedPointerEvent<HTMLElement>) => {
        prefetch.onPointerEnter()
        if (event.pointerType !== 'mouse') return
        if (canPreview) setPreviewing(true)
      }}
      onPointerLeave={() => {
        prefetch.onPointerLeave()
        setPreviewing(false)
      }}
      onPointerDown={prefetch.onPointerDown}
    >
      <Link href={watchHref} className='thumb' tabIndex={-1} aria-hidden='true'>
        {video.thumbnail
          ? <Thumbnail src={video.thumbnail} srcSet={video.thumbnailSrcset} sizes='(max-width: 500px) 100vw, 38rem' />
          : undefined}
        {previewing ? <HoverPreview videoId={video.id} href={watchHref} /> : undefined}
        {video.thumbnailBadge ? <CornerBadge label={video.thumbnailBadge} /> : undefined}
        {video.isLive
          ? <span className='badge live'>LIVE</span>
          : duration
          ? <span className='badge'>{video.isMusic ? <MusicNote /> : undefined}{duration}</span>
          : carouselShort
          ? <span className='badge'><ShortsMark /></span>
          : undefined}
        {progress !== undefined
          ? (
            <span className='progress'>
              <span style={{ width: `${progress}%` }} />
            </span>
          )
          : undefined}
      </Link>
      <div className='details'>
        {byline === 'names' && video.collaborators?.length && avatar
          ? (
            <CollaboratorsButton channels={video.collaborators} className='avatars' label='Collaboration channels'>
              <AvatarStack channels={video.collaborators} />
            </CollaboratorsButton>
          )
          : video.channel && channelHref && avatar
          ? (
            <Link
              href={channelHref}
              className={video.channel.avatar ? 'avatar' : 'avatar fallback'}
              aria-label={video.channel.name}
            >
              {video.channel.avatar
                ? <Thumbnail src={video.channel.avatar} />
                : video.channel.name.slice(0, 1).toUpperCase()}
            </Link>
          )
          : undefined}
        <div className='text'>
          <h3 className='title'>
            <Link href={watchHref}>{video.title}</Link>
          </h3>
          {/* youtube.com opens the video from a collaboration's names, and the choice of its channels from the avatars */}
          {byline === 'names'
            ? <Link href={watchHref} className='channel-name names' tabIndex={-1}><BylineNames parts={video.byline} /></Link>
            : byline === 'channel' && video.channel && channelHref
            ? <Link href={channelHref} className='channel-name'>{video.channel.name}<VerifiedBadge channel={video.channel} /></Link>
            : undefined}
          <RowMeta video={video} />
          {video.isMembersOnly ? <MembersOnly /> : undefined}
        </div>
        <VideoCardMenu videoId={video.id} title={video.title} class='more-menu' />
      </div>
    </article>
  )
}

const skeletonStyle = css`
  min-width: 0;
  animation: video-card-pulse 1.6s ease-in-out infinite;

  .thumb {
    aspect-ratio: 16 / 9;
    border-radius: 1.2rem;
    background: var(--bg-elevated);
  }

  .bar {
    height: 1.6rem;
    border-radius: 0.4rem;
    background: var(--bg-elevated);
    margin-top: 1.2rem;
  }

  .bar.short {
    width: 60%;
    margin-top: 0.8rem;
  }

  @keyframes video-card-pulse {
    0%,
    100% {
      opacity: 1;
    }

    50% {
      opacity: 0.55;
    }
  }
`

export const VideoCardSkeleton = () => (
  <div css={skeletonStyle} aria-hidden='true'>
    <div className='thumb' />
    <div className='bar' />
    <div className='bar short' />
  </div>
)

export default VideoCard
