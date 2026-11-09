import type { TargetedFocusEvent, TargetedSubmitEvent } from 'preact'

import type { ChannelTab, ChannelViewQuery, CommunityPostsQuery } from '../generated/graphql'

import { css } from '@emotion/react'
import { ChevronDown, Link2, Search } from 'lucide-react'
import { useCallback, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { useQuery } from 'urql'
import { useLocation, useSearch } from 'wouter'

import { useDocumentTitle } from '../app'
import { GroupsButton } from '../components/groups-button'
import { PlaylistCard } from '../components/playlist-card'
import { PostCard } from '../components/post-card'
import { SubscribeButton } from '../components/subscribe-button'
import { Menu, MenuItem } from '../components/ui/menu'
import { FeedSentinel, useInfiniteFeed } from '../components/use-infinite-feed'
import { VerifiedBadge } from '../components/verified-badge'
import { VideoGrid } from '../components/video-grid'
import { gql } from '../generated'
import { CHANNEL_NOT_FOUND, CHANNEL_UNAVAILABLE } from '../sources/types'
import { CHANNEL_ABOUT_QUERY, ChannelAboutDialog } from './channel-about'
import { ChannelHome } from './channel-home'

type VideosPage = ChannelViewQuery['channel']['videos']
type PostsPage = CommunityPostsQuery['communityPosts']

const COMMUNITY_POSTS_QUERY = gql(`
  query CommunityPosts($channelId: ID!, $cursor: String) {
    communityPosts(channelId: $channelId, cursor: $cursor) {
      items {
        id
        text
        publishedText
        voteCountText
        attachedImage
        author { id name avatar }
        attachedVideo {
          id
          title
          thumbnail
          thumbnailSrcset
          durationSeconds
          viewCount
          publishedText
          channel { id name }
        }
      }
      cursor
    }
  }
`)

const CHANNEL_VIEW_QUERY = gql(`
  query ChannelView($id: ID!, $tab: ChannelTab, $sort: String, $filter: String, $query: String, $cursor: String) {
    channel(id: $id, tab: $tab, sort: $sort, filter: $filter, query: $query, cursor: $cursor) {
      channel {
        id
        name
        avatar
        handle
        subscriberCountText
        videoCountText
        banner
        description
        isSubscribed
        notificationLevel
        isVerified
        isVerifiedArtist
      }
      videos {
        items {
          id
          title
          thumbnail
          thumbnailSrcset
          thumbnailBadge
          durationSeconds
          isMusic
          viewCount
          viewCountIcon
          publishedText
          metaDelimiter
          isLive
          isShort
          isUpcoming
          isMembersOnly
          badges
          byline { text isVerified isVerifiedArtist }
        }
        playlists {
          id
          title
          thumbnail
          videoCountText
          updatedText
          channel { id name }
        }
        cursor
      }
      availableTabs
      tab
      sortOptions
      appliedSort
      sortMenu
      filterOptions
      appliedFilter
      home {
        featured {
          id
          title
          description
          thumbnail
          viewCount
          publishedText
        }
        shelves {
          title
          subtitle
          url
          expandable
          uploads
          videos {
            id
            title
            thumbnail
            thumbnailSrcset
            durationSeconds
            viewCount
            publishedText
            metaDelimiter
            isLive
            isShort
            isUpcoming
            isMembersOnly
            badges
            channel { id name avatar isVerified isVerifiedArtist }
            byline { text isVerified isVerifiedArtist }
            collaborators { id name avatar handle subscriberCountText isVerified isVerifiedArtist }
          }
          shorts {
            id
            title
            thumbnail
            viewCount
          }
          playlists {
            id
            title
            thumbnail
            videoCountText
          }
          channels {
            id
            name
            avatar
            subscriberCountText
          }
          games {
            id
            title
            boxArt
          }
          posts {
            id
            text
            publishedText
            voteCountText
            attachedImage
            author { id name avatar }
            attachedVideo {
              id
              title
              thumbnail
              thumbnailSrcset
              durationSeconds
              viewCount
              publishedText
              channel { id name }
            }
          }
        }
        message
      }
    }
  }
`)

const TAB_LABELS: Record<ChannelTab, string> = {
  HOME: 'Home',
  VIDEOS: 'Videos',
  SHORTS: 'Shorts',
  LIVE: 'Live',
  RELEASES: 'Releases',
  PODCASTS: 'Podcasts',
  COURSES: 'Courses',
  SHOWS: 'Shows',
  PLAYLISTS: 'Playlists',
  COMMUNITY: 'Posts',
  ABOUT: 'About',
  SEARCH: 'Search',
}

const emptyMessageFor = (tab?: ChannelTab) => {
  if (tab === undefined || tab === 'VIDEOS' || tab === 'HOME') return 'This channel has no videos.'
  if (tab === 'SHORTS') return 'This channel has no shorts.'
  if (tab === 'LIVE') return 'This channel has no live streams.'
  return `This channel has nothing under ${TAB_LABELS[tab]}.`
}

const style = css`
  /* youtube.com widens the channel column in steps of one 214px row card, up
     to six of them, and centres it. Measured on youtube.com/@RickAstleyYT at
     1000 to 2560px wide, 2026-11-05. */
  width: max(min(100% - 3.2rem, 64.2rem), min(128.4rem, round(down, 100% - 4.8rem, 21.4rem)));
  margin: 0 auto;
  padding: 2.4rem 0;

  .banner {
    display: block;
    width: 100%;
    aspect-ratio: 6.2 / 1;
    border-radius: 1.2rem;
    object-fit: cover;
    background: var(--bg-elevated);
  }

  .header {
    display: flex;
    align-items: center;
    gap: 2.4rem;
    margin-top: 2.4rem;
  }

  .avatar {
    flex: none;
    width: 16rem;
    height: 16rem;
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
    font-size: 6.4rem;
    font-weight: 500;
    color: var(--text-primary);
  }

  .info {
    flex: 1;
    min-width: 0;
  }

  .name {
    font-size: 3.6rem;
    font-weight: 700;
    line-height: 5rem;
    color: var(--text-primary);
  }

  .meta {
    margin-top: 0.4rem;
    font-size: 1.4rem;
    color: var(--text-secondary);
  }

  .description {
    display: flex;
    max-width: min(60rem, 100%);
    margin-top: 0.8rem;
    padding: 0;
    border: none;
    background: none;
    font: inherit;
    font-size: 1.4rem;
    color: var(--text-secondary);
    text-align: left;
  }

  button.description {
    cursor: pointer;
  }

  .description-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .description .more,
  .more-links {
    flex: none;
    margin-left: 0.4rem;
    padding: 0;
    border: none;
    background: none;
    font: inherit;
    font-weight: 500;
    color: var(--text-primary);
    cursor: pointer;
  }

  .links {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-top: 0.8rem;
    font-size: 1.4rem;
    color: var(--accent);
  }

  .links a {
    min-width: 0;
    overflow: hidden;
    color: var(--accent);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .links .more-links {
    margin-left: 0;
  }

  .subscribe-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.8rem;
    margin-top: 1.2rem;
  }

  /* The rule is an inset shadow rather than a border so the active tab's
     underline can cover it inside the strip, which scrolls on a phone. */
  .tabs {
    display: flex;
    align-items: center;
    gap: 2.4rem;
    margin-top: 2.4rem;
    overflow-x: auto;
    scrollbar-width: none;
    box-shadow: inset 0 -1px var(--border-subtle);
  }

  .tabs::-webkit-scrollbar {
    display: none;
  }

  .tab {
    flex: none;
    padding: 1.2rem 0;
    border: none;
    border-bottom: 0.2rem solid transparent;
    background: transparent;
    color: var(--text-secondary);
    font-size: 1.5rem;
    font-weight: 500;
    cursor: pointer;
    transition: color 0.15s ease;
  }

  .tab:hover {
    color: var(--text-primary);
  }

  .tab.active {
    color: var(--text-primary);
    border-bottom-color: var(--text-primary);
  }

  .tab-icon {
    display: flex;
    padding: 1rem 0;
  }

  .tab-search {
    flex: none;
    display: flex;
    align-items: center;
    gap: 0.8rem;
    color: var(--text-secondary);
  }

  .tab-search input {
    width: 22rem;
    padding: 0.4rem 0;
    border: none;
    border-bottom: 1px solid var(--text-primary);
    background: transparent;
    color: var(--text-primary);
    font: inherit;
    font-size: 1.4rem;
    outline: none;
  }

  /* Only rendered when the tab offers more than one ordering, so it never shows
     a single dead option next to itself. The labels are upstream's own and are
     already localized. */
  .sorts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.8rem;
    padding: 1.6rem 0 0;
  }

  .sort {
    height: 3.2rem;
    padding: 0 1.2rem;
    border: none;
    border-radius: 0.8rem;
    background: var(--bg-chip);
    color: var(--text-primary);
    font-size: 1.4rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .sort:hover {
    background: var(--bg-chip-hover);
  }

  .sort.active {
    background: var(--bg-inverse);
    color: var(--text-inverse);
  }

  .sort.menu {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
  }

  .videos {
    margin-top: 2.4rem;
  }

  /* Matches the channel video grid's column sizing so a Playlists tab lines up
     with the Videos tab beside it in the strip. */
  .playlist-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(31rem, 1fr));
    column-gap: 1.6rem;
    row-gap: 2.4rem;
  }

  /* A single readable column rather than a grid: a post is a body of text, and
     the video grid's card width would set the measure far too wide. */
  .posts {
    display: flex;
    flex-direction: column;
    gap: 1.6rem;
    max-width: 68rem;
  }

  .status {
    margin-top: 2.4rem;
    color: var(--text-secondary);
  }

  /* youtube.com's 404 page, measured at 1280 px on 2026-11-10 */
  .not-found {
    margin-top: 16rem;
    text-align: center;
    font-size: 1.6rem;
    line-height: 1.8rem;
    color: var(--text-primary);
  }

  @media (max-width: 768px) {
    .header {
      flex-direction: column;
      align-items: center;
      text-align: center;
    }

    .avatar {
      width: 9.6rem;
      height: 9.6rem;
    }

    .avatar.fallback {
      font-size: 4rem;
    }

    /* full width rather than shrink-wrapped, or the one-line description
       would size it to the whole unwrapped text */
    .info {
      width: 100%;
    }

    .description,
    .links,
    .subscribe-row {
      justify-content: center;
    }

    .description {
      margin-inline: auto;
    }

    .name {
      font-size: 2.4rem;
      line-height: 3.2rem;
    }
  }
`

export const ChannelPage = ({ params }: { params: { channelId?: string, handle?: string } }) => {
  const id = params.channelId ?? `@${params.handle ?? ''}`
  const search = useSearch()
  const urlParams = new URLSearchParams(search)
  const [location, navigate] = useLocation()
  const requestedTab = (urlParams.get('tab') ?? undefined) as ChannelTab | undefined
  // youtube.com's /about opens the channel with its About dialog over it, which is what /about redirects here to
  const aboutRequested = requestedTab === 'ABOUT'
  const tab = aboutRequested ? undefined : requestedTab
  const sort = urlParams.get('sort') ?? undefined
  const filter = urlParams.get('filter') ?? undefined
  const channelQuery = urlParams.get('query') ?? undefined
  // tab, sort, filter and in-channel query are part of the feed identity: switching any of them MUST restart paging
  const feedKey = `${id}|${tab ?? ''}|${sort ?? ''}|${filter ?? ''}|${channelQuery ?? ''}`
  const [loaded, setLoaded] = useState<{ id: string, pages: VideosPage[] }>({ id: feedKey, pages: [] })
  const pages = loaded.id === feedKey ? loaded.pages : []
  const [{ data, error, fetching }] = useQuery({
    query: CHANNEL_VIEW_QUERY,
    variables: { id, tab, sort, filter, query: channelQuery, cursor: pages[pages.length - 1]?.cursor }
  })
  const channel = data?.channel.channel
  const unavailable = error?.graphQLErrors.find(entry => entry.message.startsWith(CHANNEL_UNAVAILABLE))
  const missing = error?.graphQLErrors.some(entry => entry.message === CHANNEL_NOT_FOUND) === true
  const page = data?.channel.videos
  const { items, cursor } = useInfiniteFeed({
    pages: page ? [...pages, page] : pages,
    key: video => video.id
  })
  const { items: playlists } = useInfiniteFeed({
    pages: (page ? [...pages, page] : pages).map(entry => ({ items: entry.playlists, cursor: entry.cursor })),
    key: playlist => playlist.id,
  })
  useDocumentTitle(channel?.name ?? 'Channel')
  const handle = channel?.handle
    ? channel.handle.startsWith('@') ? channel.handle : `@${channel.handle}`
    : undefined
  const metaParts = [handle, channel?.subscriberCountText, channel?.videoCountText]
    .filter(part => part != null && part.length > 0)
  const meta = metaParts.length > 0 ? metaParts.join(' • ') : undefined

  // a tab switch MUST clear sort, filter and query: upstream's labels differ per tab and the new tab rejects the old ones
  const setView = (param: 'tab' | 'sort' | 'filter', value: string) => {
    const next = new URLSearchParams(search)
    if (param === 'tab') {
      next.delete('sort')
      next.delete('filter')
      next.delete('query')
    }
    if (next.get(param) === value) next.delete(param)
    else next.set(param, value)
    const rest = next.toString()
    navigate(rest ? `${location}?${rest}` : location)
  }

  const activeTab = data?.channel.tab
  const hasAbout = data?.channel.availableTabs.includes('ABOUT') === true
  // asked with the page rather than on "...more": the header's links line is read off it
  const [{ data: aboutData }] = useQuery({
    query: CHANNEL_ABOUT_QUERY,
    variables: { id },
    pause: !hasAbout,
  })
  const about = aboutData?.channelAbout ?? undefined
  const [firstLink, ...moreLinks] = about?.links ?? []
  const hasSearch = data?.channel.availableTabs.includes('SEARCH') === true
  const [searching, setSearching] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  // focused before the first paint, so the keystroke after the click lands in the box
  useLayoutEffect(() => {
    if (searching) searchRef.current?.focus()
  }, [searching])
  const onSearch = (event: TargetedSubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    const value = searchRef.current?.value.trim()
    if (!value) return
    setSearching(false)
    navigate(`${location}?${new URLSearchParams({ tab: 'SEARCH', query: value })}`)
  }

  const [aboutOpen, setAboutOpen] = useState(false)
  const openAbout = () => setAboutOpen(true)
  // stable, since the dialog re-runs its focus effect whenever onClose changes
  const closeAbout = useCallback(() => {
    setAboutOpen(false)
    if (aboutRequested) navigate(location, { replace: true })
  }, [aboutRequested, location, navigate])

  const [postPages, setPostPages] = useState<PostsPage[]>([])
  const [{ data: postsData, fetching: postsFetching }] = useQuery({
    query: COMMUNITY_POSTS_QUERY,
    variables: { channelId: id, cursor: postPages[postPages.length - 1]?.cursor },
    pause: activeTab !== 'COMMUNITY',
  })
  const postPage = postsData?.communityPosts
  const { items: posts, cursor: postsCursor } = useInfiniteFeed({
    pages: postPage ? [...postPages, postPage] : postPages,
    key: post => post.id,
  })

  const onMorePosts = () => {
    if (!postPage?.cursor || postsFetching) return
    setPostPages(postPages[postPages.length - 1] === postPage ? postPages : [...postPages, postPage])
  }

  const onMore = () => {
    if (!page?.cursor || fetching) return
    setLoaded({ id: feedKey, pages: pages[pages.length - 1] === page ? pages : [...pages, page] })
  }

  return (
    <main css={style}>
      {channel?.banner ? <img className='banner' src={channel.banner} alt='' /> : undefined}
      {channel
        ? (
          <header className='header'>
            <div className={channel.avatar ? 'avatar' : 'avatar fallback'}>
              {channel.avatar
                ? <img src={channel.avatar} alt='' />
                : channel.name.slice(0, 1).toUpperCase()}
            </div>
            <div className='info'>
              <h1 className='name'>{channel.name}<VerifiedBadge channel={channel} size={20} /></h1>
              {meta ? <p className='meta'>{meta}</p> : undefined}
              {hasAbout
                ? (
                  <button type='button' className='description' onClick={openAbout}>
                    <span className='description-text'>{channel.description ?? 'More about this channel'}</span>
                    <span className='more'>...more</span>
                  </button>
                )
                : channel.description
                  ? <p className='description'><span className='description-text'>{channel.description}</span></p>
                  : undefined}
              {firstLink
                ? (
                  <p className='links'>
                    <Link2 size={14} strokeWidth={2} aria-hidden='true' />
                    <a href={firstLink.url} target='_blank' rel='noreferrer noopener'>{firstLink.displayUrl ?? firstLink.title}</a>
                    {moreLinks.length > 0
                      ? (
                        <button type='button' className='more-links' onClick={openAbout}>
                          and {moreLinks.length} more {moreLinks.length === 1 ? 'link' : 'links'}
                        </button>
                      )
                      : undefined}
                  </p>
                )
                : undefined}
              <div className='subscribe-row'>
                <SubscribeButton
                  channelId={channel.id}
                  subscribed={channel.isSubscribed}
                  notificationLevel={channel.notificationLevel}
                />
                <GroupsButton channel={{ id: channel.id, name: channel.name, avatar: channel.avatar ?? undefined }} />
              </div>
            </div>
          </header>
        )
        : undefined}
      {channel && (aboutOpen || aboutRequested)
        ? <ChannelAboutDialog name={channel.name} about={about} description={channel.description} onClose={closeAbout} />
        : undefined}
      {missing
        ? (
          <div className='not-found'>
            <p>This page isn't available. Sorry about that.</p>
            <p>Try searching for something else.</p>
          </div>
        )
        : undefined}
      {error && !missing
        ? (
          <p className='status'>
            {unavailable ? unavailable.message.slice(CHANNEL_UNAVAILABLE.length) : 'Couldn\'t load this channel. Try again later.'}
          </p>
        )
        : undefined}
      <nav className='tabs' aria-label='Channel sections'>
        {(data?.channel.availableTabs ?? []).filter(available => available !== 'ABOUT' && available !== 'SEARCH').map(available => {
          const active = available === data?.channel.tab
          return (
            <button
              key={available}
              type='button'
              className={active ? 'tab active' : 'tab'}
              aria-current={active ? 'page' : undefined}
              onClick={() => setView('tab', available)}
            >
              {TAB_LABELS[available]}
            </button>
          )
        })}
        {hasSearch && (searching || channelQuery !== undefined)
          ? (
            <form className='tab-search' onSubmit={onSearch}>
              <Search size={20} strokeWidth={1.5} aria-hidden='true' />
              <input
                key={channelQuery}
                ref={searchRef}
                type='search'
                placeholder='Search'
                aria-label='Search this channel'
                defaultValue={channelQuery}
                onBlur={(event: TargetedFocusEvent<HTMLInputElement>) => {
                  if (!event.currentTarget.value) setSearching(false)
                }}
              />
            </form>
          )
          : hasSearch
            ? (
              <button type='button' className='tab tab-icon' aria-label='Search' onClick={() => setSearching(true)}>
                <Search size={20} strokeWidth={1.5} />
              </button>
            )
            : undefined}
      </nav>
      {(data?.channel.sortOptions.length ?? 0) > 1 || (data?.channel.filterOptions.length ?? 0) > 0
        ? (
          <div className='sorts'>
            {data?.channel.sortMenu
              ? (
                <Menu
                  label='Sort by'
                  align='start'
                  trigger={
                    <button type='button' className='sort menu'>
                      {data.channel.appliedSort ?? data.channel.sortOptions[0]}
                      <ChevronDown size={20} strokeWidth={1.5} />
                    </button>
                  }
                >
                  {data.channel.sortOptions.map(option => (
                    <MenuItem
                      key={option}
                      label={option}
                      onSelect={() => {
                        if (option !== (data.channel.appliedSort ?? data.channel.sortOptions[0])) setView('sort', option)
                      }}
                    />
                  ))}
                </Menu>
              )
              : data?.channel.sortOptions.map(option => {
                const active = option === (data.channel.appliedSort ?? data.channel.sortOptions[0])
                return (
                  <button
                    key={option}
                    type='button'
                    className={active ? 'sort active' : 'sort'}
                    aria-pressed={active}
                    onClick={() => setView('sort', option)}
                  >
                    {option}
                  </button>
                )
              })}
            {data?.channel.filterOptions.map(option => {
              const active = option === data.channel.appliedFilter
              return (
                <button
                  key={option}
                  type='button'
                  className={active ? 'sort active' : 'sort'}
                  aria-pressed={active}
                  onClick={() => setView('filter', option)}
                >
                  {option}
                </button>
              )
            })}
          </div>
        )
        : undefined}
      {activeTab === 'COMMUNITY'
        ? (
          <div className='videos'>
            <div className='posts'>
              {posts.map(post => <PostCard key={post.id} post={post} />)}
            </div>
            {!postsFetching && posts.length === 0
              ? <p className='status'>This channel has no posts.</p>
              : undefined}
            <FeedSentinel onVisible={onMorePosts} disabled={postsFetching || !postsCursor} />
          </div>
        )
        : activeTab === 'HOME' && data?.channel.home
          ? (
            <div className='videos'>
              <ChannelHome home={data.channel.home} />
              {!data.channel.home.featured && data.channel.home.shelves.length === 0
                ? <p className='status'>{data.channel.home.message ?? emptyMessageFor('HOME')}</p>
                : undefined}
            </div>
          )
          : (
            <>
              <div className='videos'>
                <VideoGrid videos={items} fetching={fetching && items.length === 0} variant='channel' />
                {playlists.length > 0
                  ? (
                    <div className='playlist-grid'>
                      {playlists.map(playlist => (
                        <PlaylistCard
                          key={playlist.id}
                          id={playlist.id}
                          title={playlist.title}
                          thumbnail={playlist.thumbnail}
                          videoCountText={playlist.videoCountText}
                          updatedText={playlist.updatedText}
                          channelName={activeTab === 'SHOWS' ? playlist.channel?.name : undefined}
                        />
                      ))}
                    </div>
                  )
                  : undefined}
                {data && !fetching && !error && items.length === 0 && playlists.length === 0
                  ? <p className='status'>{emptyMessageFor(tab)}</p>
                  : undefined}
              </div>
              {fetching && items.length > 0 ? <p className='status'>Loading more…</p> : undefined}
              <FeedSentinel onVisible={onMore} disabled={fetching || !cursor} />
            </>
          )}
    </main>
  )
}

export default ChannelPage
