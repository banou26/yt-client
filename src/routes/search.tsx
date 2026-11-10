import type { SearchResultsQuery, SearchVideoFragment } from '../generated/graphql'

import type { TargetedPointerEvent } from 'preact'

import { css } from '@emotion/react'
import { ListVideo, SlidersHorizontal, X } from 'lucide-react'
import { useCallback, useState } from 'preact/hooks'
import { useQuery } from 'urql'
import { Link, useLocation, useSearch } from 'wouter'

import { useDocumentTitle } from '../app'
import { AvatarStack, BylineNames, CollaboratorsButton } from '../components/byline'
import { ChapterStrip } from '../components/chapters'
import { formatDuration, formatMeta, rowByline } from '../components/format'
import { playlistHrefFor } from '../components/playlist'
import { Rail } from '../components/rail'
import { MusicNote } from '../components/row-marks'
import { SearchCard } from '../components/search-card'
import { activeChip, chipSearch, SEARCH_CHIPS } from '../components/search-chips'
import { chosen, FILTER_GROUPS, filterSearch, removable, searchFilters, searchParams } from '../components/search-filters'
import { ShortsShelf } from '../components/shorts-shelf'
import SubscribeButton from '../components/subscribe-button'
import { Thumbnail } from '../components/thumbnail'
import { TopicCard } from '../components/topic-card'
import Dialog from '../components/ui/dialog'
import { VerifiedBadge } from '../components/verified-badge'
import { FeedSentinel, useInfiniteFeed } from '../components/use-infinite-feed'
import { VideoCard, VideoCardMenu, watchHrefFor } from '../components/video-card'
import { gql } from '../generated'
import { HoverPreview } from '../player/hover-preview'
import { usePrefetchOnIntent } from '../player/prefetch'
import { withPage } from './feed-pages'

type ResultsPage = SearchResultsQuery['search']
type SearchRow = ResultsPage['results'][number]

const SEARCH_RESULTS_QUERY = gql(`
  query SearchResults($query: String!, $filters: SearchFilters, $cursor: String) {
    search(query: $query, filters: $filters, cursor: $cursor) {
      results {
        __typename
        ...SearchVideo
        ... on Channel {
          id
          name
          avatar
          handle
          subscriberCountText
          videoCountText
          description
          isSubscribed
          notificationLevel
          isVerified
          isVerifiedArtist
        }
        ... on Playlist {
          id
          title
          thumbnail
          videoCountText
          channel { id name }
        }
        ... on SearchCard {
          # aliased: the same selection holds a Video's nullable channel, and one field name cannot be both
          cardChannel: channel {
            id
            name
            avatar
            handle
            subscriberCountText
            videoCountText
            description
            isSubscribed
            notificationLevel
            isVerified
            isVerifiedArtist
          }
          mix { id title thumbnail videoId }
          videos { ...SearchVideo }
        }
        ... on SearchShelf {
          title
          subtitle
          horizontal
          collapsedCount
          videos { ...SearchVideo }
          shorts { id title thumbnail viewCount }
        }
      }
      topic {
        title
        subtitle
        channelId
        hero { id title thumbnail subtitle }
        videos { id title thumbnail durationSeconds subtitle scheduledAt channel { id name } }
      }
      refinements
      cursor
      unwatchedChip
    }
  }

  fragment SearchVideo on Video {
    id
    title
    description
    descriptionSnippet
    snippetRuns { text bold }
    thumbnail
    thumbnailSrcset
    durationSeconds
    isMusic
    viewCount
    publishedText
    isLive
    isUpcoming
    badges
    channel { id name avatar isVerified isVerifiedArtist }
    chapters { title startSeconds thumbnail }
    chaptersTitle
    byline { text isVerified isVerifiedArtist }
    collaborators { id name avatar handle subscriberCountText isVerified isVerifiedArtist }
  }
`)

const style = css`
  max-width: 109.6rem;
  padding: 2.4rem 1.6rem;

  /* youtube.com caps the results and the topic card's column together at
     1280px, the results 855px wide from 1600 to 1920px: measured signed out
     on 2026-11-10. */
  &.with-topic {
    max-width: 131.2rem;
  }

  .columns {
    display: flex;
    align-items: flex-start;
    gap: 4rem;
  }

  .columns > .results {
    flex: 1;
    min-width: 0;
  }

  .topic {
    flex: none;
    width: 38.5rem;
    margin-top: 1.6rem;
  }

  /* youtube.com drops the right column below 1091px rather than moving it
     into the results: measured signed out on 2026-11-10. */
  @media (max-width: 1090px) {
    .topic {
      display: none;
    }
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }

  .status {
    color: var(--text-secondary);
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 1.6rem;
    padding-bottom: 1.2rem;
  }

  .filter-chips {
    flex: 1;
    min-width: 0;
    display: flex;
    gap: 1.2rem;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .filter-chips::-webkit-scrollbar {
    display: none;
  }

  .filter-chip {
    flex: none;
    height: 3.2rem;
    padding: 0 1.2rem;
    border: none;
    border-radius: 0.8rem;
    background: var(--bg-chip);
    color: var(--text-primary);
    font-size: 1.4rem;
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .filter-chip:hover {
    background: var(--bg-chip-hover);
  }

  .filter-chip.active {
    background: var(--bg-inverse);
    color: var(--text-inverse);
  }

  .filter-chip.active:hover {
    background: var(--bg-inverse-hover);
  }

  .filter-toggle {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 0.8rem;
    height: 3.6rem;
    padding: 0 1.6rem;
    border: none;
    border-radius: 1.8rem;
    background: transparent;
    color: var(--text-primary);
    font-size: 1.4rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .filter-toggle:hover {
    background: var(--bg-hover);
  }

  .filters {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
    gap: 2.4rem;
  }

  .group-title {
    margin: 0 0 0.8rem;
    padding-bottom: 1.2rem;
    border-bottom: 1px solid var(--border-subtle);
    font-size: 1.2rem;
    font-weight: 500;
    color: var(--text-primary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .option {
    display: flex;
    align-items: center;
    gap: 1.2rem;
    width: fit-content;
    padding: 0.8rem 0;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: 1.4rem;
    text-align: left;
    cursor: pointer;
  }

  .option:hover {
    color: var(--text-primary);
  }

  .option.active {
    color: var(--text-primary);
    font-weight: 500;
  }

  .option svg {
    flex: none;
    margin: -0.2rem 0;
  }

  .refinements {
    display: flex;
    flex-wrap: wrap;
    gap: 0.8rem;
    padding: 1.6rem 0;
  }

  .refinement {
    height: 3.2rem;
    padding: 0 1.2rem;
    border: 1px solid var(--border);
    border-radius: 1.6rem;
    background: transparent;
    color: var(--text-primary);
    font-size: 1.3rem;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .refinement:hover {
    background: var(--bg-hover);
  }

  .results {
    display: flex;
    flex-direction: column;
    gap: 1.6rem;
    padding-top: 1.6rem;
  }

  /* youtube.com's row: the thumbnail takes half the row, up to 500px. */
  .result {
    display: grid;
    grid-template-columns: minmax(24rem, min(50rem, 50%)) minmax(0, 1fr);
    gap: 1.6rem;
  }

  .result .thumb {
    position: relative;
    display: block;
    aspect-ratio: 16 / 9;
    border-radius: 1.2rem;
    overflow: hidden;
    background: var(--bg-chip);
  }

  .result .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .result .badge {
    position: absolute;
    right: 0.8rem;
    bottom: 0.8rem;
    display: flex;
    align-items: center;
    gap: 0.2rem;
    padding: 0.2rem 0.4rem;
    border-radius: 0.4rem;
    background: rgba(0, 0, 0, 0.8);
    color: #fff;
    font-size: 1.2rem;
    font-weight: 500;
  }

  .result .badge.live {
    background: var(--brand-red);
  }

  .result .title-row {
    display: flex;
    align-items: flex-start;
    gap: 0.8rem;
  }

  .result .title {
    flex: 1;
    min-width: 0;
    margin: 0;
    font-size: 1.8rem;
    font-weight: 400;
    line-height: 2.6rem;
    color: var(--text-primary);
  }

  .result .more {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 4rem;
    height: 4rem;
    margin-top: -0.7rem;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--text-primary);
    cursor: pointer;
  }

  .result .more:hover {
    background: var(--bg-hover);
  }

  .shelf-heading {
    margin: 0.8rem 0 0;
    font-size: 2rem;
    font-weight: 700;
    line-height: 2.8rem;
    color: var(--text-primary);
  }

  /* youtube.com's carousel of video cards inside the results, measured signed
     out at 1280 and 412px on 2026-11-10: 44px from the row above to its title,
     cards 360px wide on a 364px step, 40px from them to the row below. */
  .carousel-shelf {
    padding: 2.8rem 0 2.4rem;
  }

  .carousel-shelf .shelf-heading {
    margin: 0;
  }

  .shelf-subtitle {
    margin: 0.4rem 0 0;
    font-size: 1.4rem;
    line-height: 2rem;
    color: var(--text-secondary);
  }

  .carousel-rail {
    --rail-gap: 0.4rem;
    --rail-arrow-top: 8.1rem;
    margin-top: 2.4rem;
  }

  .carousel-card {
    width: 36rem;
  }

  @media (max-width: 599px) {
    .carousel-shelf .shelf-heading {
      font-size: 1.8rem;
      line-height: 2.6rem;
    }
  }

  .shelf-more {
    display: block;
    margin: 0 auto;
    padding: 0.8rem 1.6rem;
    border: none;
    border-radius: 1.8rem;
    background: transparent;
    color: var(--text-secondary);
    font-size: 1.2rem;
    font-weight: 500;
    cursor: pointer;
  }

  .shelf-more:hover {
    background: var(--bg-hover);
  }

  .result .meta {
    margin-top: 0.4rem;
    font-size: 1.2rem;
    color: var(--text-secondary);
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-top: 0.6rem;
  }

  .chip {
    padding: 0.1rem 0.4rem;
    border: 1px solid var(--border);
    border-radius: 0.2rem;
    font-size: 1.1rem;
    color: var(--text-secondary);
  }

  .channel {
    display: inline-flex;
    align-items: center;
    gap: 0.8rem;
    margin-top: 1.2rem;
    font-size: 1.2rem;
    color: var(--text-secondary);
  }

  .result .avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.4rem;
    height: 2.4rem;
    border-radius: 50%;
    overflow: hidden;
    background: var(--bg-chip);
    font-size: 1.1rem;
  }

  .result .avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .description {
    margin: 1.2rem 0 0;
    font-size: 1.2rem;
    line-height: 1.8rem;
    color: var(--text-secondary);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .description b {
    font-weight: 500;
  }

  /* A channel row is centred on its own axis rather than sharing the video
     grid's top alignment, which is what youtube.com does and what keeps a row
     with almost no metadata from looking like it lost its thumbnail. */
  .result.channel-row {
    align-items: center;
  }

  .channel-avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 13.6rem;
    height: 13.6rem;
    margin: 0 auto;
    border-radius: 50%;
    overflow: hidden;
    background: var(--bg-chip);
    color: var(--text-primary);
    font-size: 4rem;
  }

  .channel-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .result .channel-name {
    margin: 0;
    font-size: 1.8rem;
    font-weight: 400;
    color: var(--text-primary);
  }

  .channel-actions {
    margin-top: 1.2rem;
  }

  .playlist-thumb {
    position: relative;
    display: block;
    aspect-ratio: 16 / 9;
    border-radius: 1.2rem;
    overflow: hidden;
    background: var(--bg-chip);
  }

  .playlist-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .playlist-overlay {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    width: 40%;
    background: rgba(0, 0, 0, 0.6);
    color: #fff;
    font-size: 1.2rem;
  }

  /* A row's own shape with nothing in it, drawn while the first page is on its way. */
  .result-placeholder {
    animation: search-placeholder-pulse 1.6s ease-in-out infinite;
  }

  .result-placeholder .bar {
    display: block;
    height: 1.6rem;
    border-radius: 0.4rem;
    background: var(--bg-chip);
  }

  .result-placeholder .bar-title {
    width: 90%;
    height: 2rem;
    margin-top: 0.3rem;
  }

  .result-placeholder .bar-meta {
    width: 40%;
    margin-top: 0.8rem;
  }

  .result-placeholder .bar-channel {
    width: 12rem;
  }

  .result-placeholder .bar-description {
    width: 70%;
    margin-top: 1.2rem;
  }

  @keyframes search-placeholder-pulse {
    0%,
    100% {
      opacity: 1;
    }

    50% {
      opacity: 0.55;
    }
  }

  @media (max-width: 900px) {
    .result,
    .result.channel-row {
      grid-template-columns: minmax(0, 1fr);
    }

    .result .thumb {
      max-width: none;
      min-width: 0;
    }
  }
`

// a video and a channel can hold the same id string, so the key carries the member as well or one evicts the other from the deduped feed
const rowKey = (row: SearchRow) => {
  if (row.__typename === 'SearchCard') return `card:${row.cardChannel.id}`
  // two shelves can share a title ("Shorts"), never a first item
  if (row.__typename === 'SearchShelf') return `shelf:${row.title}:${(row.videos[0] ?? row.shorts[0])?.id}`
  return row.__typename === 'Channel' ? `channel:${row.id}` : `${row.__typename}:${row.id}`
}

type ShelfResult = Extract<SearchRow, { __typename: 'SearchShelf' }>

const PLACEHOLDER_ROWS = 6

const ResultPlaceholder = () => (
  <div className='result result-placeholder' aria-hidden='true'>
    <div className='thumb' />
    <div>
      <div className='bar bar-title' />
      <div className='bar bar-meta' />
      <div className='channel'>
        <span className='avatar' />
        <span className='bar bar-channel' />
      </div>
      <div className='bar bar-description' />
    </div>
  </div>
)

const VideoRow = ({ row }: { row: SearchVideoFragment }) => {
  const prefetch = usePrefetchOnIntent(row.id)
  const [previewing, setPreviewing] = useState(false)
  const watchHref = watchHrefFor(row.id)
  const duration = formatDuration(row.durationSeconds)
  const meta = formatMeta(row.viewCount, row.publishedText)
  const snippet = row.snippetRuns?.map((run, index) => run.bold ? <b key={index}>{run.text}</b> : run.text)
    ?? row.descriptionSnippet
    ?? row.description
  const canPreview = row.isUpcoming !== true && row.isLive !== true
  return (
    <article
      className='result'
      onPointerEnter={(event: TargetedPointerEvent<HTMLElement>) => {
        prefetch.onPointerEnter()
        if (event.pointerType === 'mouse' && canPreview) setPreviewing(true)
      }}
      onPointerLeave={() => {
        prefetch.onPointerLeave()
        setPreviewing(false)
      }}
      onPointerDown={prefetch.onPointerDown}
    >
      <Link href={watchHref} className='thumb' tabIndex={-1} aria-hidden='true'>
        {row.thumbnail ? <Thumbnail src={row.thumbnail} srcSet={row.thumbnailSrcset} sizes='50rem' /> : undefined}
        {previewing ? <HoverPreview videoId={row.id} href={watchHref} /> : undefined}
        {row.isLive
          ? <span className='badge live'>LIVE</span>
          : duration ? <span className='badge'>{row.isMusic ? <MusicNote /> : undefined}{duration}</span> : undefined}
      </Link>
      <div className='info'>
        <div className='title-row'>
          <h2 className='title'>
            <Link href={watchHref}>{row.title}</Link>
          </h2>
          <VideoCardMenu videoId={row.id} title={row.title} iconSize={24} />
        </div>
        {meta ? <div className='meta'>{meta}</div> : undefined}
        {row.badges.length > 0
          ? (
            <div className='chips'>
              {row.badges.map(badge => <span className='chip' key={badge}>{badge}</span>)}
            </div>
          )
          : undefined}
        {/* youtube.com opens the choice of a collaboration's channels from its avatars, and the video from its names */}
        {rowByline(row) === 'names'
          ? (
            <div className='channel'>
              {row.collaborators?.length
                ? (
                  <CollaboratorsButton channels={row.collaborators} className='avatars' label='Collaboration channels'>
                    <AvatarStack channels={row.collaborators} />
                  </CollaboratorsButton>
                )
                : undefined}
              <Link href={watchHref} className='names' tabIndex={-1}><BylineNames parts={row.byline} badgeSize={12} /></Link>
            </div>
          )
          : row.channel
          ? (
            <Link href={`/channel/${row.channel.id}`} className='channel'>
              <span className={row.channel.avatar ? 'avatar' : 'avatar fallback'}>
                {row.channel.avatar
                  ? <Thumbnail src={row.channel.avatar} />
                  : row.channel.name.slice(0, 1).toUpperCase()}
              </span>
              <span>{row.channel.name}<VerifiedBadge channel={row.channel} size={12} /></span>
            </Link>
          )
          : undefined}
        {snippet ? <p className='description'>{snippet}</p> : undefined}
        {row.chapters?.length
          ? <ChapterStrip videoId={row.id} chapters={row.chapters} title={row.chaptersTitle} />
          : undefined}
      </div>
    </article>
  )
}

const ResultShelf = ({ shelf }: { shelf: ShelfResult }) => {
  const [expanded, setExpanded] = useState(false)
  if (shelf.shorts.length > 0) return <ShortsShelf shorts={shelf.shorts} title={shelf.title} />
  if (shelf.horizontal) {
    return (
      <section className='carousel-shelf' aria-label={shelf.title}>
        <h2 className='shelf-heading'>{shelf.title}</h2>
        {shelf.subtitle ? <p className='shelf-subtitle'>{shelf.subtitle}</p> : undefined}
        <div className='carousel-rail'>
          <Rail label={shelf.title} count={shelf.videos.length} wholeCards>
            {shelf.videos.map(video => (
              <div className='carousel-card' key={video.id}>
                <VideoCard video={video} variant='carousel' />
              </div>
            ))}
          </Rail>
        </div>
      </section>
    )
  }
  const shown = expanded || !shelf.collapsedCount ? shelf.videos : shelf.videos.slice(0, shelf.collapsedCount)
  const hidden = shelf.videos.length - shown.length
  return (
    <section className='results' aria-label={shelf.title}>
      <h2 className='shelf-heading'>{shelf.title}</h2>
      {shown.map(video => <VideoRow key={video.id} row={video} />)}
      {hidden > 0
        ? <button type='button' className='shelf-more' onClick={() => setExpanded(true)}>+{hidden} More</button>
        : undefined}
    </section>
  )
}

const SearchPage = () => {
  const params = searchParams(useSearch())
  const query = params.get('search_query') ?? ''
  const [, navigate] = useLocation()
  useDocumentTitle(query.length > 0 ? query : 'Search')

  const filters = searchFilters(params)
  const chip = activeChip(params)
  const [filtersOpen, setFiltersOpen] = useState(false)
  // stable, or the dialog re-runs its focus effect on every navigation a filter makes
  const closeFilters = useCallback(() => setFiltersOpen(false), [])

  const feedKey = `${query}|${JSON.stringify(filters)}`
  const [loaded, setLoaded] = useState<{ key: string, pages: ResultsPage[] }>({ key: feedKey, pages: [] })
  const pages = loaded.key === feedKey ? loaded.pages : []

  const [{ data, error, fetching }] = useQuery({
    query: SEARCH_RESULTS_QUERY,
    variables: { query, filters, cursor: pages[pages.length - 1]?.cursor },
    pause: query.length === 0
  })
  const page = data?.search
  const { items, cursor } = useInfiniteFeed({
    pages: withPage(pages, page).map(entry => ({ items: entry.results, cursor: entry.cursor })),
    key: rowKey
  })

  // shown until the first page says upstream has none, so the row does not shift on most searches
  const unwatchedChip = (pages[0] ?? page)?.unwatchedChip ?? true
  const topic = (pages[0] ?? page)?.topic

  const onMore = () => {
    if (!page?.cursor || fetching || error) return
    setLoaded({ key: feedKey, pages: pages[pages.length - 1] === page ? pages : [...pages, page] })
  }

  const onRefine = (refinement: string) => {
    navigate(`/results?${new URLSearchParams({ search_query: refinement })}`)
  }

  return (
    <main css={style} className={topic ? 'with-topic' : undefined}>
      <h1 className='sr-only'>Results for {query}</h1>
      <div className='toolbar'>
        <div className='filter-chips'>
          {SEARCH_CHIPS.filter(entry => entry.id !== 'unwatched' || unwatchedChip).map(entry => (
            <button
              type='button'
              key={entry.id}
              className={entry.id === chip ? 'filter-chip active' : 'filter-chip'}
              aria-pressed={entry.id === chip}
              onClick={() => navigate(`/results?${chipSearch(params, entry)}`)}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <button type='button' className='filter-toggle' onClick={() => setFiltersOpen(true)}>
          Filters
          <SlidersHorizontal size={20} strokeWidth={1.5} />
        </button>
      </div>
      {filtersOpen
        ? (
          <Dialog title='Search filters' wide onClose={closeFilters}>
            <div className='filters'>
              {FILTER_GROUPS.map(group => (
                <div key={group.param}>
                  <h3 className='group-title'>{group.label}</h3>
                  {group.options.map(option => {
                    const active = chosen(params, group).includes(option.value)
                    return (
                      <button
                        type='button'
                        key={option.value}
                        className={active ? 'option active' : 'option'}
                        aria-pressed={active}
                        onClick={active && !removable(group)
                          ? undefined
                          : () => {
                            setFiltersOpen(false)
                            navigate(`/results?${filterSearch(params, group, option.value)}`)
                          }}
                      >
                        {option.label}
                        {active && removable(group) ? <X size={20} strokeWidth={1.5} /> : undefined}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          </Dialog>
        )
        : undefined}
      {page?.refinements && page.refinements.length > 0
        ? (
          <div className='refinements'>
            {page.refinements.map(refinement => (
              <button type='button' key={refinement} className='refinement' onClick={() => onRefine(refinement)}>
                {refinement}
              </button>
            ))}
          </div>
        )
        : undefined}
      {error ? <p className='status'>{error.message}</p> : undefined}
      <div className='columns'>
        <div className='results'>
          {items.map(row => {
            if (row.__typename === 'SearchCard') return <SearchCard key={rowKey(row)} card={row} />
            if (row.__typename === 'SearchShelf') return <ResultShelf key={rowKey(row)} shelf={row} />
            if (row.__typename === 'Channel') {
              return (
                <article className='result channel-row' key={rowKey(row)}>
                  <Link href={`/channel/${row.id}`} className='channel-avatar' tabIndex={-1} aria-hidden='true'>
                    {row.avatar
                      ? <Thumbnail src={row.avatar} />
                      : row.name.slice(0, 1).toUpperCase()}
                  </Link>
                  <div>
                    <h2 className='channel-name'>
                      <Link href={`/channel/${row.id}`}>{row.name}<VerifiedBadge channel={row} /></Link>
                    </h2>
                    <div className='meta'>
                      {[row.handle, row.subscriberCountText, row.videoCountText].filter(Boolean).join(' • ')}
                    </div>
                    {row.description ? <p className='description'>{row.description}</p> : undefined}
                    <div className='channel-actions'>
                      <SubscribeButton
                        channelId={row.id}
                        subscribed={row.isSubscribed}
                        notificationLevel={row.notificationLevel}
                      />
                    </div>
                  </div>
                </article>
              )
            }

            if (row.__typename === 'Playlist') {
              const href = playlistHrefFor(row.id)
              return (
                <article className='result' key={rowKey(row)}>
                  <Link href={href} className='playlist-thumb' tabIndex={-1} aria-hidden='true'>
                    {row.thumbnail ? <Thumbnail src={row.thumbnail} /> : undefined}
                    <span className='playlist-overlay'>
                      <ListVideo size={24} strokeWidth={1.5} />
                      {row.videoCountText ?? ''}
                    </span>
                  </Link>
                  <div className='info'>
                    <h2 className='title'>
                      <Link href={href}>{row.title}</Link>
                    </h2>
                    {row.channel
                      ? (
                        <Link href={`/channel/${row.channel.id}`} className='channel'>
                          <span>{row.channel.name}</span>
                        </Link>
                      )
                      : undefined}
                  </div>
                </article>
              )
            }

            return <VideoRow key={rowKey(row)} row={row} />
          })}
          {fetching && items.length === 0
            ? Array.from({ length: PLACEHOLDER_ROWS }, (_, index) => <ResultPlaceholder key={index} />)
            : undefined}
        </div>
        {topic ? <div className='topic'><TopicCard topic={topic} /></div> : undefined}
      </div>
      {query.length > 0 && !fetching && !error && items.length === 0
        ? <p className='status'>No results found.</p>
        : undefined}
      {fetching && items.length > 0 ? <p className='status'>Loading more…</p> : undefined}
      <FeedSentinel onVisible={onMore} disabled={fetching || !cursor} />
    </main>
  )
}

export default SearchPage
