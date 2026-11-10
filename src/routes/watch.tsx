import type { PlaylistPanelData } from '../components/playlist-panel'
import type { RelatedVideosQuery } from '../generated/graphql'

import type { VideoCardData } from '../components/video-card'

import { css } from '@emotion/react'
import { EllipsisVertical, Link2, Share2, ThumbsDown, ThumbsUp } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import { useQuery } from 'urql'
import { Link, useSearch } from 'wouter'

import { useDocumentTitle, useMediaQuery } from '../app'
import { AvatarStack, BylineNames, CollaboratorsButton } from '../components/byline'
import { ChatReplay, ChatReplayTeaser } from '../components/chat-replay'
import Comments from '../components/comments'
import { DataFailure } from '../components/data-failure'
import DescriptionBox from '../components/description-box'
import { formatCompact, parseStartSeconds } from '../components/format'
import LiveChat from '../components/live-chat'
import PlaylistPanel from '../components/playlist-panel'
import { useRateVideo } from '../components/rate-video'
import { MembersOnly } from '../components/row-marks'
import SaveMenu from '../components/save-menu'
import ShareDialog from '../components/share-dialog'
import SubscribeButton, { subscribeStyle } from '../components/subscribe-button'
import { FeedSentinel } from '../components/use-infinite-feed'
import { VerifiedBadge } from '../components/verified-badge'
import { VideoCardCompact, VideoCardCompactSkeleton } from '../components/video-card-compact'
import { watchPanel } from '../components/watch-panel'
import { useDislikes } from '../dislikes'
import { gql } from '../generated'
import { prefetchPlayback } from '../player/prefetch'
import {
  claimPlayer, closePlayer, getPlayerSession, openPlayer, setPanel, setTheater as setPlayerTheater, usePlayerSession,
} from '../player/session'
import { descriptionOf, WATCH_META_QUERY } from '../player/watch-query'
import { Menu, MenuItem } from '../components/ui/menu'
import { getSettings, updateSettings } from '../settings'

// youtube.com's one column, from 999 px down, which also opens the chat replay and chapters under the player
const ONE_COLUMN = '(max-width: 999px)'

const style = css`
  display: grid;
  /* youtube.com's own proportions, measured at 1000 to 2560 px wide on
     2026-11-10: a 16 px margin and gap, 12 px above the player, the sidebar
     27.5% of the window held between 320 px and 35% of the window or 700 px,
     and the player takes the rest, never under 640 px, up to the width whose
     16:9 frame still fits under the header with room below it. A short window
     gives the width the player cannot take to the sidebar, up to that maximum,
     and only what is left past both centers the two. From 1000 to 1007 px wide
     the two keep the left margin and run into the right one (theater centers
     them instead). */
  --player-max: max(64rem, calc((100vh - var(--header-height) - 6rem) * 16 / 9));
  --sidebar: clamp(32rem, max(27.5vw, 100% - 1.6rem - var(--player-max)), min(35vw, 70rem));
  grid-template-columns: minmax(64rem, var(--player-max)) var(--sidebar);
  justify-content: safe center;
  /* The sidebar spans BOTH rows, and an auto-sized row absorbs a share of a
     spanning item that is taller than its own content. So a long sidebar
     inflated row 1 and pushed the title and description far below the player:
     measured at 590px below it with 40 related videos, and 1610px once paging
     had loaded more.

     min-content pins row 1 to the player it actually holds, and the FLEXIBLE
     second row is what makes it stick: a spanning item's excess height is
     shared out across intrinsic rows, so a min-content plus auto pair still
     inflated row 1 (measured: a 2007px gap). A flexible track absorbs that
     excess instead. */
  grid-template-rows: min-content 1fr;
  align-items: start;
  gap: 0 1.6rem;
  padding: 1.2rem 1.6rem 2.4rem;

  .stage {
    grid-column: 1;
  }

  /* Reserves the player's box. The player is moved in as a child rather than
     rendered here, so without a size of its own this slot would collapse and
     the page would jump as the video arrives. */
  .player-slot,
  .player-slot > .player-host {
    display: block;
    width: 100%;
  }

  .primary {
    grid-column: 1;
    min-width: 0;
  }

  .panel-slot {
    grid-column: 1;
    margin-top: 1.2rem;
  }

  .secondary {
    grid-column: 2;
    grid-row: 1 / span 2;
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
    /* youtube.com's 62.5% of the row at every width: 200 of 320, 220 of 352, 330 of 528 */
    --compact-thumb-width: 62.5%;
  }

  /* The columns join this grid in the default view. youtube.com's theater, measured 2026-11-10, runs the player edge
     to edge and keeps the default view's column widths and centering under it, so there they take a grid of their
     own. From 1000 to 1007 px wide the two overflow the margins evenly there. */
  .columns {
    display: contents;
  }

  &.theater {
    grid-template-columns: minmax(0, 1fr);
    padding: 0 0 2.4rem;
  }

  &.theater .stage {
    background: #000;
  }

  &.theater .columns {
    display: grid;
    grid-template-columns: minmax(64rem, var(--player-max)) var(--sidebar);
    justify-content: center;
    align-items: start;
    gap: 0 1.6rem;
    padding: 0 1.6rem;
  }

  /* Keeps a tall window from pushing the title below the fold. Excluded in
     fullscreen: this selector out-specifies the player's own :fullscreen rule,
     so without :not() it would cap the height of a fullscreened player and
     letterbox it inside a correctly sized container.

     Matched on the player's own attribute rather than on a direct child: the
     player is moved in through a slot and a host node now, so it is two levels
     down and a child-combinator selector silently stops matching.

     youtube.com's own rule, read 2026-11-10: the window height less 169 px,
     never under 480 px (240 px in one column). */
  &.theater .stage [data-player-root]:not(:fullscreen) {
    max-height: calc(100vh - 169px);
    min-height: 480px;
    border-radius: 0;
  }

  &.theater .secondary {
    grid-row: 1;
    padding-top: 2.4rem;
  }

  .primary > .chat-replay {
    margin-top: 1.2rem;
  }

  .about {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    column-gap: 1.2rem;
  }

  .about > * {
    flex: 1 1 30rem;
    min-width: 0;
  }

  /* an opened description takes the whole row, as youtube.com's does, and the chat replay card moves under it */
  .about > div:not(.collapsed) {
    flex-basis: 100%;
  }

  .title {
    margin: 1.2rem 0 0;
    font-size: 2rem;
    font-weight: 700;
    line-height: 2.8rem;
    color: var(--text-primary);
  }

  .owner-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 1.2rem;
    margin-top: 1.2rem;
  }

  .avatars {
    --avatar-size: 2.8rem;
    flex: none;
  }

  .avatar {
    flex: none;
    width: 4rem;
    height: 4rem;
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

  .owner-text {
    min-width: 0;
    margin-right: 1.2rem;
  }

  .channel-name {
    display: flex;
    align-items: center;
    width: fit-content;
    max-width: 100%;
    font-size: 1.6rem;
    font-weight: 500;
    line-height: 2.2rem;
    color: var(--text-primary);
  }

  /* the badge stays after the ellipsis, as on youtube.com */
  .channel-name .name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sub-count {
    font-size: 1.2rem;
    color: var(--text-secondary);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.8rem;
    margin-left: auto;
  }

  .like-pill {
    display: flex;
    align-items: stretch;
    height: 3.6rem;
    border-radius: 1.8rem;
    background: var(--bg-chip);
    overflow: hidden;
  }

  .like,
  .dislike {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 1.4rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .like {
    padding: 0 1.2rem 0 1.6rem;
    border-right: 1px solid var(--border-subtle);
  }

  .dislike {
    padding: 0 1.6rem;
  }

  .like:hover,
  .dislike:hover {
    background: var(--bg-chip-hover);
  }

  .pill {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    height: 3.6rem;
    padding: 0 1.6rem;
    border: none;
    border-radius: 1.8rem;
    background: var(--bg-chip);
    color: var(--text-primary);
    font-size: 1.4rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .pill:hover {
    background: var(--bg-chip-hover);
  }

  .round {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 3.6rem;
    height: 3.6rem;
    border: none;
    border-radius: 50%;
    background: var(--bg-chip);
    color: var(--text-primary);
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .round:hover {
    background: var(--bg-chip-hover);
  }

  @media ${ONE_COLUMN} {
    --margin: 1.6rem;
    padding: 2.4rem var(--margin);

    grid-template-columns: minmax(0, 1fr);

    .stage,
    .primary,
    .secondary,
    &.theater .secondary {
      grid-column: 1;
      grid-row: auto;
    }

    &.theater .columns {
      display: contents;
    }

    .secondary {
      margin-top: 2.4rem;
      --compact-thumb-width: 16.8rem;
    }

    &.theater {
      padding: 0 var(--margin) 2.4rem;
    }

    &.theater .stage {
      margin: 0 calc(-1 * var(--margin));
    }

    &.theater .stage [data-player-root]:not(:fullscreen) {
      min-height: 240px;
    }
  }

  @media (max-width: 768px) {
    padding: 1.2rem var(--margin);
  }

  /* youtube.com's title column never goes under 426.667 px, a 240 px tall
     16:9 player, so below 459 px its margins shrink and its page scrolls
     sideways. A phone keeps 12 px margins here and no sideways scroll. */
  @media (max-width: 458px) {
    --margin: 1.2rem;
  }
`

const RELATED_MORE_QUERY = gql(`
  query RelatedVideos($cursor: String!) {
    relatedVideos(cursor: $cursor) {
      items {
        id
        title
        thumbnail
        thumbnailSrcset
        animatedThumbnail
        thumbnailBadge
        durationSeconds
        isMusic
        viewCount
        viewCountIcon
        publishedText
        metaDelimiter
        isLive
        isMembersOnly
        channel { id name isVerified isVerifiedArtist }
        byline { text isVerified isVerifiedArtist }
        collaborators { id name avatar handle subscriberCountText isVerified isVerifiedArtist }
      }
      cursor
    }
  }
`)

type RelatedPage = RelatedVideosQuery['relatedVideos']

/* youtube.com's page for a video that no longer exists, measured at 1280 px on 2026-11-10: its heading sits 32.5rem
   under the masthead at any height, below a 16.1rem picture this page leaves out, since www.youtube.com serves it */
const unavailableStyle = css`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32.5rem 2.4rem 2.4rem;
  text-align: center;

  h1 {
    font-size: 2.4rem;
    font-weight: 700;
    line-height: 3.2rem;
    color: var(--text-primary);
  }

  .home {
    display: flex;
    align-items: center;
    height: 4rem;
    margin-top: 3.2rem;
    padding: 0 1.5rem;
    border: 1px solid var(--border-strong);
    border-radius: 2rem;
    color: var(--accent);
    font-size: 1.4rem;
    font-weight: 500;
    text-decoration: none;
  }

  .home:hover {
    background: var(--accent-hover);
  }
`

const RELATED_SKELETON_KEYS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']

const WatchPage = () => {
  const params = new URLSearchParams(useSearch())
  const videoId = params.get('v') ?? ''
  prefetchPlayback(videoId)
  // `index` is 1-BASED in the URL, matching youtube.com, while the schema takes a 0-based `playlistIndex`
  const listId = params.get('list') ?? undefined
  // app.tsx keeps `t` out of the route identity, so changing it does NOT remount the player
  const startAt = parseStartSeconds(params.get('t'))
  const indexParam = Number(params.get('index'))
  const playlistIndex = Number.isInteger(indexParam) && indexParam > 0 ? indexParam - 1 : undefined
  const [{ data: watchData, error: watchError, fetching: watchFetching }, reexecuteWatch] = useQuery({
    query: WATCH_META_QUERY,
    variables: { id: videoId, playlistId: listId, playlistIndex },
    // load-bearing: WatchMeta is keyed by video id and WatchPlaylist is embedded in it, so every argument set for one video shares a single `playlist` slot (a plain ?v= read writes null over it, a read from another queue writes that queue's panel), and cache-first would serve the stale slot straight back
    requestPolicy: 'cache-and-network',
    pause: videoId === ''
  })
  const { rate, rating } = useRateVideo(videoId, watchData?.watch?.likeStatus)
  const dislikes = useDislikes(videoId)
  const playerSession = usePlayerSession()
  const theater = playerSession.theater
  const toggleTheater = useCallback(() => {
    setPlayerTheater(updateSettings({ theater: !getSettings().theater }).theater)
  }, [])

  useEffect(() => {
    setRelatedPages([])
    setWantMoreRelated(false)
  }, [videoId])
  useEffect(() => setSharing(false), [videoId])

  const watch = watchData?.watch
  useDocumentTitle(watch?.title ?? undefined)
  const channel = watch?.channel
  const unavailable = watch?.unavailableText ?? undefined

  useEffect(() => {
    if (videoId === '') return
    if (unavailable) {
      if (getPlayerSession().videoId === videoId) closePlayer()
      return
    }
    openPlayer({ videoId, startAt, title: watch?.title ?? undefined, list: listId, index: playlistIndex })
  }, [videoId, startAt, watch?.title, listId, playlistIndex, unavailable])
  // the sidebar pages from its own cursor: re-running /next would restart the whole watch
  const [wantMoreRelated, setWantMoreRelated] = useState(false)
  const [relatedPages, setRelatedPages] = useState<RelatedPage[]>([])
  const relatedCursor = relatedPages[relatedPages.length - 1]?.cursor ?? watch?.relatedCursor
  const [{ data: moreData, fetching: moreFetching }] = useQuery({
    query: RELATED_MORE_QUERY,
    variables: { cursor: relatedCursor ?? '' },
    pause: !wantMoreRelated || !relatedCursor,
  })
  const morePage = moreData?.relatedVideos
  const related: VideoCardData[] | undefined = watch?.related
    ? [...watch.related, ...relatedPages.flatMap(entry => entry.items)]
      .filter((video, index, all) => all.findIndex(other => other.id === video.id) === index)
    : undefined
  // gated on the URL: WatchMeta is keyed by video id, so its one `playlist` slot can hold another queue's panel
  const playlist: PlaylistPanelData | undefined =
    listId === undefined || watch?.playlist?.id !== listId ? undefined : watch.playlist
  const liked = watch?.likeStatus === 'LIKE'
  const disliked = watch?.likeStatus === 'DISLIKE'

  const [sharing, setSharing] = useState(false)
  // held as the video it was opened on, so the next video starts with the panel closed
  const [replayFor, setReplayFor] = useState<string | undefined>(undefined)
  const replayOpen = watch?.hasChatReplay === true && replayFor === videoId
  const oneColumn = useMediaQuery(ONE_COLUMN)
  const replay = replayOpen
    ? <ChatReplay key={`replay:${videoId}`} videoId={videoId} onClose={() => setReplayFor(undefined)} />
    : undefined

  const chapters = watch?.chapters ?? []
  const playingHere = playerSession.videoId === videoId
  const chapter = playingHere ? playerSession.chapter : -1
  const stageRef = useRef<HTMLDivElement>(null)
  const transcript = watch?.transcriptPanel ?? undefined
  const videoPanel = playingHere
    ? watchPanel({
      videoId,
      open: playerSession.panel,
      chapters,
      chapter,
      transcript,
      fit: oneColumn || theater ? undefined : stageRef,
    })
    : undefined

  if (unavailable) {
    return (
      <main css={unavailableStyle}>
        <h1>{unavailable}</h1>
        <Link href='/' className='home'>GO TO HOME</Link>
      </main>
    )
  }

  return (
    <main css={style} className={theater ? 'theater' : undefined}>
      <div className='stage' ref={stageRef}>
        {/* The player is NOT mounted here: it lives above the router, so leaving the page docks it rather than destroying its SABR session */}
        <div className='player-slot' ref={claimPlayer} />
      </div>
      {oneColumn && videoPanel ? <div className='panel-slot'>{videoPanel}</div> : undefined}
      <div className='columns'>
        <div className='primary'>
          {oneColumn ? replay : undefined}
          {watch?.title ? <h1 className='title'>{watch.title}</h1> : undefined}
          {watch?.isMembersOnly ? <MembersOnly /> : undefined}
          {watchError && !watch && !watchFetching ? <DataFailure error={watchError} reexecute={reexecuteWatch} /> : undefined}
          {watch
            ? (
              <div className='owner-row'>
                {/* youtube.com opens the choice of a collaboration's channels from its avatars, its names and its Subscribe */}
                {watch.byline?.length && watch.collaborators?.length
                  ? (
                    <>
                      <CollaboratorsButton channels={watch.collaborators} subscribe className='avatars' label='Collaboration channels'>
                        <AvatarStack channels={watch.collaborators} />
                      </CollaboratorsButton>
                      <div className='owner-text'>
                        <CollaboratorsButton channels={watch.collaborators} subscribe className='channel-name'>
                          <span className='name'><BylineNames parts={watch.byline} /></span>
                        </CollaboratorsButton>
                      </div>
                      <div css={subscribeStyle}>
                        <CollaboratorsButton channels={watch.collaborators} subscribe className='subscribe'>Subscribe</CollaboratorsButton>
                      </div>
                    </>
                  )
                  : channel
                  ? (
                    <>
                      <Link
                        href={`/channel/${channel.id}`}
                        className={channel.avatar ? 'avatar' : 'avatar fallback'}
                        aria-label={channel.name}
                      >
                        {channel.avatar
                          ? <img src={channel.avatar} alt='' loading='lazy' />
                          : channel.name.slice(0, 1).toUpperCase()}
                      </Link>
                      <div className='owner-text'>
                        <Link href={`/channel/${channel.id}`} className='channel-name'>
                          <span className='name'>{channel.name}</span>
                          <VerifiedBadge channel={channel} />
                        </Link>
                        {channel.subscriberCountText
                          ? <div className='sub-count'>{channel.subscriberCountText}</div>
                          : undefined}
                      </div>
                      <SubscribeButton
                        channelId={channel.id}
                        subscribed={channel.isSubscribed}
                        notificationLevel={channel.notificationLevel}
                      />
                    </>
                  )
                  : undefined}
                <div className='actions'>
                  <div className='like-pill'>
                    <button
                      type='button'
                      className='like'
                      aria-label='Like'
                      aria-pressed={liked}
                      disabled={rating}
                      onClick={() => rate('LIKE')}
                    >
                      <ThumbsUp size={20} strokeWidth={1.5} fill={liked ? 'currentColor' : 'none'} />
                      {watch?.likeCountText ? <span>{watch.likeCountText}</span> : undefined}
                    </button>
                    <button
                      type='button'
                      className='dislike'
                      aria-label='Dislike'
                      aria-pressed={disliked}
                      disabled={rating}
                      onClick={() => rate('DISLIKE')}
                    >
                      <ThumbsDown size={20} strokeWidth={1.5} fill={disliked ? 'currentColor' : 'none'} />
                      {dislikes !== undefined ? <span>{formatCompact(dislikes)}</span> : undefined}
                    </button>
                  </div>
                  <button type='button' className='pill' onClick={() => setSharing(true)}>
                    <Share2 size={20} strokeWidth={1.5} />
                    Share
                  </button>
                  {/* Save sits beside Share rather than inside the More menu: a menu's panel is drawn on the body, so a press in a nested one would close the menu holding it */}
                  <SaveMenu videoId={videoId} />
                  <Menu
                    label='More actions'
                    trigger={
                      <button type='button' className='round' aria-label='More actions'>
                        <EllipsisVertical size={20} strokeWidth={1.5} />
                      </button>
                    }
                  >
                    <MenuItem icon={Link2} label='Share' onSelect={() => setSharing(true)} />
                    <MenuItem
                      label='Theater mode'
                      checked={theater}
                      closeOnSelect
                      onSelect={toggleTheater}
                    />
                  </Menu>
                </div>
              </div>
            )
            : undefined}
          <div className='about'>
            {watch?.description || watch?.viewCountText || watch?.publishedDateText
              ? (
                <DescriptionBox
                  key={`description:${videoId}`}
                  {...descriptionOf(watch)}
                  videoId={videoId}
                  chapters={chapters}
                  currentChapter={chapter}
                  onViewChapters={() => setPanel('chapters')}
                  onShowTranscript={transcript ? () => setPanel('transcript') : undefined}
                />
              )
              : undefined}
            {watch?.hasChatReplay ? <ChatReplayTeaser open={replayOpen} onOpen={() => setReplayFor(videoId)} /> : undefined}
          </div>
          {!watchFetching && watch && !watch.commentsHidden
            ? <Comments key={`comments:${videoId}`} videoId={videoId} commentCountText={watch.commentCountText} />
            : undefined}
        </div>
        {watchFetching || playlist || watch?.isLive || replayOpen || (related && related.length > 0) || (!oneColumn && videoPanel)
          ? (
            <aside className='secondary'>
              {oneColumn ? undefined : replay}
              {oneColumn ? undefined : videoPanel}
              {playlist ? <PlaylistPanel playlist={playlist} /> : undefined}
              {watch?.isLive ? <LiveChat key={`chat:${videoId}`} videoId={videoId} /> : undefined}
              {related
                ? related.map(item => <VideoCardCompact key={item.id} video={item} />)
                : RELATED_SKELETON_KEYS.map(key => <VideoCardCompactSkeleton key={key} />)}
              {relatedCursor
                ? (
                  <FeedSentinel
                    onVisible={() => {
                      if (!wantMoreRelated) setWantMoreRelated(true)
                      else if (morePage && !moreFetching) {
                        setRelatedPages(pages => pages[pages.length - 1] === morePage ? pages : [...pages, morePage])
                      }
                    }}
                    disabled={moreFetching}
                  />
                )
                : undefined}
            </aside>
          )
          : undefined}
      </div>
      {sharing ? <ShareDialog videoId={videoId} title={watch?.title ?? undefined} list={listId} onClose={() => setSharing(false)} /> : undefined}
    </main>
  )
}

export default WatchPage
