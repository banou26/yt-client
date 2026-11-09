import type { ChannelTab } from './generated/graphql'

import { css } from '@emotion/react'
import { Suspense } from 'preact/compat'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { Redirect, Route, Switch, useLocation, useSearch } from 'wouter'

import { safeDecode } from './components/format'
import Guide from './components/guide'
import Header from './components/header'
import { lazyRoute } from './components/lazy-route'
import ErrorBoundary from './components/ui/error-boundary'
import PersistentPlayer from './player/persistent-player'
import HomePage from './routes/home'
import { getSettings, updateSettings } from './settings'

// HomePage is deliberately static while every other route is lazy: routing the landing page through Suspense would put a chunk fetch in front of the very first paint, the one navigation with no previous page to keep showing
const ChannelPage = lazyRoute(() => import('./routes/channel'))
const FeedGroupsPage = lazyRoute(() => import('./routes/feed-groups'))
const FeedHistoryPage = lazyRoute(() => import('./routes/feed-history'))
const FeedPlaylistsPage = lazyRoute(() => import('./routes/feed-playlists'))
const FeedSubscriptionsPage = lazyRoute(() => import('./routes/feed-subscriptions'))
const FeedYouPage = lazyRoute(() => import('./routes/feed-you'))
const GroupPage = lazyRoute(() => import('./routes/group'))
const PlaylistPage = lazyRoute(() => import('./routes/playlist'))
const PostPage = lazyRoute(() => import('./routes/post'))
const PrivacyPage = lazyRoute(() => import('./routes/privacy'))
const SearchPage = lazyRoute(() => import('./routes/search'))
const SettingsPage = lazyRoute(() => import('./routes/settings'))
const AccountPage = lazyRoute(() => import('./routes/account'))
const ShortsPage = lazyRoute(() => import('./routes/shorts'))
const SignInPage = lazyRoute(() => import('./routes/signin'))
const WatchPage = lazyRoute(() => import('./routes/watch'))

const style = css`
  min-height: 100vh;

  .content {
    padding-top: var(--header-height);
  }

  .page {
    min-width: 0;
  }

  .page.guide-expanded {
    margin-left: var(--guide-width);
  }

  .page.guide-mini {
    margin-left: var(--guide-mini-width);
  }

  .not-found {
    padding: 2.4rem 1.6rem;
    color: var(--text-secondary);
  }

  /* Deliberately blank rather than a spinner. Chunks are local and resolve in
     a frame or two, and a spinner that flashes on every navigation reads as
     the app being slower than it is. */
  .route-loading {
    min-height: 60vh;
  }
`

const BASE_TITLE = 'yt-client'

export const useDocumentTitle = (title?: string) => {
  useEffect(() => {
    if (title === undefined) return
    document.title = `${title} - ${BASE_TITLE}`
  }, [title])
  // restores on UNMOUNT only: a cleanup keyed on the title would race a route whose title arrives late
  useEffect(() => () => {
    document.title = BASE_TITLE
  }, [])
}

// kept out of the route identity: a position is not a navigation, and remounting would kill playback
const POSITION_PARAMS = ['t']

// same for the path the Shorts pager rewrites as slides scroll
const collapsePath = (pathname: string) =>
  pathname.startsWith('/shorts/') ? '/shorts' : pathname

const routeKeyOf = (pathname: string, search: string) => {
  const params = new URLSearchParams(search)
  for (const param of POSITION_PARAMS) params.delete(param)
  const rest = params.toString()
  const path = collapsePath(pathname)
  return rest ? `${path}?${rest}` : path
}

const SearchRedirect = ({ query }: { query: string }) => (
  <Redirect to={`/results?${new URLSearchParams({ search_query: query })}`} replace />
)

// an embed's `start` is the watch page's `t`
const WatchRedirect = ({ videoId }: { videoId: string }) => {
  const query = new URLSearchParams(useSearch())
  const watch = new URLSearchParams({ v: safeDecode(videoId) })
  const at = query.get('t') ?? query.get('start')
  if (at) watch.set('t', at)
  return <Redirect to={`/watch?${watch}`} replace />
}

// keyed by upstream's OWN path words, which do not all match the enum: `live` is `/streams`, home is `/featured`
const CHANNEL_TAB_PATHS: Record<string, ChannelTab> = {
  featured: 'HOME',
  videos: 'VIDEOS',
  shorts: 'SHORTS',
  streams: 'LIVE',
  releases: 'RELEASES',
  podcasts: 'PODCASTS',
  courses: 'COURSES',
  shows: 'SHOWS',
  playlists: 'PLAYLISTS',
  community: 'COMMUNITY',
  posts: 'COMMUNITY',
  about: 'ABOUT',
}

const ChannelTabRedirect = ({ base, tab }: { base: string, tab?: string }) => {
  const mapped = CHANNEL_TAB_PATHS[safeDecode(tab ?? '').toLowerCase()]
  if (!mapped) return <p className='not-found'>Not found</p>
  return <Redirect to={mapped === 'HOME' ? base : `${base}?${new URLSearchParams({ tab: mapped })}`} replace />
}

// `path` is youtube.com's channel address without its slash, `c/<name>` or `user/<name>`, which the source resolves as it does an @handle
const ChannelPathRoute = ({ path, tab }: { path: string, tab?: string }) =>
  tab === undefined ? <ChannelPage params={{ channelId: path }} /> : <ChannelTabRedirect base={`/${path}`} tab={tab} />

const useMediaQuery = (query: string) => {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const media = window.matchMedia(query)
    const onChange = () => setMatches(media.matches)
    media.addEventListener('change', onChange)
    setMatches(media.matches)
    return () => media.removeEventListener('change', onChange)
  }, [query])
  return matches
}

export const App = () => {
  const [location] = useLocation()
  const search = useSearch()
  const route = routeKeyOf(location, search)
  const [collapsed, setCollapsed] = useState(() => getSettings().guideCollapsed)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const narrow = useMediaQuery('(max-width: 1312px)')
  const tiny = useMediaQuery('(max-width: 792px)')
  const currentRoute = useRef(route)
  const offsets = useRef(new Map<string, number>())
  const wentBack = useRef(false)

  const isWatch = location.startsWith('/watch')
  const overlayOnly = isWatch || tiny
  const guideVariant = overlayOnly ? undefined : collapsed || narrow ? 'mini' as const : 'expanded' as const

  useEffect(() => {
    history.scrollRestoration = 'manual'
    const onScroll = () => offsets.current.set(currentRoute.current, scrollY)
    const onPopState = () => {
      wentBack.current = true
    }
    // wouter patches history.pushState to dispatch this nonstandard event, the counterpart to popstate
    const onPushState = () => {
      wentBack.current = false
    }
    addEventListener('scroll', onScroll, { passive: true })
    addEventListener('popstate', onPopState)
    addEventListener('pushState', onPushState)
    return () => {
      removeEventListener('scroll', onScroll)
      removeEventListener('popstate', onPopState)
      removeEventListener('pushState', onPushState)
    }
  }, [])

  useLayoutEffect(() => {
    if (currentRoute.current === route) return
    currentRoute.current = route
    setDrawerOpen(false)
    const restored = wentBack.current ? offsets.current.get(route) : undefined
    wentBack.current = false
    scrollTo(0, restored ?? 0)
  }, [route])

  const onMenu = useCallback(() => {
    if (overlayOnly || narrow) {
      setDrawerOpen(open => !open)
      return
    }
    setCollapsed(value => updateSettings({ guideCollapsed: !value }).guideCollapsed)
  }, [overlayOnly, narrow])

  return (
    <div css={style}>
      <Header onMenu={onMenu} />
      <div className='content'>
        {guideVariant ? <Guide variant={guideVariant} /> : undefined}
        <div className={guideVariant ? `page guide-${guideVariant}` : 'page'}>
          <ErrorBoundary key={route}>
            <Suspense fallback={<div className='route-loading' />}>
            <Switch>
              <Route path='/' component={HomePage} />
              <Route path='/results' component={SearchPage} />
              <Route path='/watch' component={WatchPage} />
              <Route path='/playlist' component={PlaylistPage} />
              <Route path='/shorts' component={ShortsPage} />
              <Route path='/shorts/:videoId' component={ShortsPage} />
              <Route path='/feed/subscriptions' component={FeedSubscriptionsPage} />
              <Route path='/feed/history' component={FeedHistoryPage} />
              <Route path='/feed/playlists' component={FeedPlaylistsPage} />
              <Route path='/feed/you' component={FeedYouPage} />
              {/* before the generic two-segment route below, which would answer /feed/groups with Not found */}
              <Route path='/feed/groups' component={FeedGroupsPage} />
              <Route path='/feed/groups/:id' component={GroupPage} />
              <Route path='/channel/:channelId' component={ChannelPage} />
              <Route path='/settings' component={SettingsPage} />
              <Route path='/privacy' component={PrivacyPage} />
              <Route path='/account' component={AccountPage} />
              <Route path='/signin' component={SignInPage} />
              <Route path='/search/:query'>
                {(params: { query: string }) => <SearchRedirect query={safeDecode(params.query)} />}
              </Route>
              {/* youtube.com's hashtag page lists what a search for the tag finds, which is where a description's hashtags lead */}
              <Route path='/hashtag/:tag'>
                {(params: { tag: string }) => <SearchRedirect query={`#${safeDecode(params.tag)}`} />}
              </Route>
              <Route path='/watch/:videoId'>{(params: { videoId: string }) => <WatchRedirect videoId={params.videoId} />}</Route>
              {/* the link youtube.com's Share button gives for a live stream */}
              <Route path='/live/:videoId'>{(params: { videoId: string }) => <WatchRedirect videoId={params.videoId} />}</Route>
              <Route path='/embed/:videoId'>{(params: { videoId: string }) => <WatchRedirect videoId={params.videoId} />}</Route>
              <Route path='/c/:name/:tab?'>
                {(params: { name: string, tab?: string }) => <ChannelPathRoute path={`c/${params.name}`} tab={params.tab} />}
              </Route>
              <Route path='/user/:name/:tab?'>
                {(params: { name: string, tab?: string }) => <ChannelPathRoute path={`user/${params.name}`} tab={params.tab} />}
              </Route>
              {/* youtube.com's Gaming topic channel, as the guide's Explore links it */}
              <Route path='/gaming'><Redirect to='/channel/UCOpNcN46UbXVtpKMrmU4Abg' replace /></Route>
              <Route path='/post/:postId' component={PostPage} />
              {/* claims the whole segment because wouter's parser never matches `/@:handle`, so it MUST stay declared after every real single-segment route: Switch takes the first match, and this can then only see paths nothing else wanted */}
              <Route path='/:segment'>
                {(params: { segment?: string }) => params.segment?.startsWith('@')
                  ? <ChannelPage params={{ handle: params.segment.slice(1) }} />
                  : <p className='not-found'>Not found</p>}
              </Route>
              {/* MUST stay before the generic two-segment route below, which would answer with Not found */}
              <Route path='/channel/:channelId/:tab'>
                {(params: { channelId?: string, tab?: string }) => (
                  <ChannelTabRedirect base={`/channel/${params.channelId ?? ''}`} tab={params.tab} />
                )}
              </Route>
              <Route path='/:segment/:tab'>
                {(params: { segment?: string, tab?: string }) => params.segment?.startsWith('@')
                  ? <ChannelTabRedirect base={`/${params.segment}`} tab={params.tab} />
                  : <p className='not-found'>Not found</p>}
              </Route>
              <Route>
                <p className='not-found'>Not found</p>
              </Route>
            </Switch>
            </Suspense>
          </ErrorBoundary>
        </div>
      </div>
      {(overlayOnly || narrow) && drawerOpen ? <Guide variant='drawer' onClose={() => setDrawerOpen(false)} /> : undefined}
      {/* outside the <Switch> on purpose: the one thing that has to survive a route change */}
      <PersistentPlayer />
    </div>
  )
}

export default App
