import type { ChannelTab } from './generated/graphql'

import { css } from '@emotion/react'
import { Suspense } from 'preact/compat'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { Redirect, Route, Switch, useLocation, useSearch } from 'wouter'

import { cameBack } from './back-navigation'
import { safeDecode } from './components/format'
import Guide from './components/guide'
import Header from './components/header'
import { lazyRoute } from './components/lazy-route'
import ErrorBoundary from './components/ui/error-boundary'
import PersistentPlayer from './player/persistent-player'
import { CHANNEL_TAB_PATHS, channelTabFor } from './routes/channel-tabs'
import HomePage from './routes/home'
import NotFound from './routes/not-found'
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
    outline: none;
  }

  .page.guide-expanded {
    margin-left: var(--guide-width);
  }

  .page.guide-mini {
    margin-left: var(--guide-mini-width);
  }

  /* Deliberately blank rather than a spinner. Chunks are local and resolve in
     a frame or two, and a spinner that flashes on every navigation reads as
     the app being slower than it is. */
  .route-loading {
    min-height: 60vh;
  }
`

const BASE_TITLE = 'yt-client'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

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

// an embed's `start` is the watch page's `t`, and `/embed/videoseries?list=<id>` is the embed of a whole playlist
const WatchRedirect = ({ videoId }: { videoId: string }) => {
  const query = new URLSearchParams(useSearch())
  const list = query.get('list')
  if (videoId === 'videoseries' && list) return <Redirect to={`/playlist?${new URLSearchParams({ list })}`} replace />
  const watch = new URLSearchParams({ v: safeDecode(videoId) })
  if (list) watch.set('list', list)
  const at = query.get('t') ?? query.get('start')
  if (at) watch.set('t', at)
  return <Redirect to={`/watch?${watch}`} replace />
}

// `base` is the channel's address as given (`/@handle`, `/channel/<id>`, `/c/<name>` or `/user/<name>`) and `word` the
// tab's word after it. `?tab=<TAB>` is how this client addressed a tab before it took youtube.com's addresses.
const ChannelRoute = ({ id, base, word }: { id: string, base: string, word?: string }) => {
  const query = new URLSearchParams(useSearch())
  const legacy = query.get('tab')
  query.delete('tab')
  const rest = query.size > 0 ? `?${query}` : ''
  if (legacy !== null) {
    const path = Object.hasOwn(CHANNEL_TAB_PATHS, legacy) ? `/${CHANNEL_TAB_PATHS[legacy as ChannelTab]}` : ''
    return <Redirect to={`${base}${path}${rest}`} replace />
  }
  if (word === undefined) return <ChannelPage id={id} base={base} />
  const tab = channelTabFor(safeDecode(word))
  if (!tab) return <NotFound />
  if (word !== CHANNEL_TAB_PATHS[tab]) return <Redirect to={`${base}/${CHANNEL_TAB_PATHS[tab]}${rest}`} replace />
  return <ChannelPage id={id} base={base} tab={tab} />
}

/** Whether a CSS media query matches, kept current as the window changes. */
export const useMediaQuery = (query: string) => {
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
  const pageRef = useRef<HTMLDivElement>(null)

  const isWatch = location.startsWith('/watch')
  const overlayOnly = isWatch || tiny
  const guideVariant = overlayOnly ? undefined : collapsed || narrow ? 'mini' as const : 'expanded' as const

  useEffect(() => {
    history.scrollRestoration = 'manual'
    const onScroll = () => offsets.current.set(currentRoute.current, scrollY)
    addEventListener('scroll', onScroll, { passive: true })
    return () => removeEventListener('scroll', onScroll)
  }, [])

  useLayoutEffect(() => {
    if (currentRoute.current === route) return
    currentRoute.current = route
    setDrawerOpen(false)
    const restored = cameBack() ? offsets.current.get(route) : undefined
    scrollTo(0, restored ?? 0)
  }, [route])

  const onMenu = useCallback(() => {
    if (overlayOnly || narrow) {
      setDrawerOpen(open => !open)
      return
    }
    setCollapsed(value => updateSettings({ guideCollapsed: !value }).guideCollapsed)
  }, [overlayOnly, narrow])

  // youtube.com's Skip navigation lands on the page's first control, or on the page itself when it has none
  const onSkip = useCallback(() => {
    const page = pageRef.current
    if (!page) return
    const first = [...page.querySelectorAll<HTMLElement>(FOCUSABLE)].find(element => element.checkVisibility({ visibilityProperty: true }))
    ;(first ?? page).focus()
  }, [])

  return (
    <div css={style}>
      <Header onMenu={onMenu} onSkip={onSkip} />
      <div className='content'>
        {guideVariant ? <Guide variant={guideVariant} /> : undefined}
        <div ref={pageRef} tabIndex={-1} className={guideVariant ? `page guide-${guideVariant}` : 'page'}>
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
              <Route path='/channel/:channelId/:tab?'>
                {(params: { channelId: string, tab?: string }) => <ChannelRoute id={params.channelId} base={`/channel/${params.channelId}`} word={params.tab} />}
              </Route>
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
                {(params: { name: string, tab?: string }) => <ChannelRoute id={`c/${params.name}`} base={`/c/${params.name}`} word={params.tab} />}
              </Route>
              <Route path='/user/:name/:tab?'>
                {(params: { name: string, tab?: string }) => <ChannelRoute id={`user/${params.name}`} base={`/user/${params.name}`} word={params.tab} />}
              </Route>
              {/* youtube.com's Gaming topic channel, as the guide's Explore links it */}
              <Route path='/gaming'><Redirect to='/channel/UCOpNcN46UbXVtpKMrmU4Abg' replace /></Route>
              <Route path='/post/:postId' component={PostPage} />
              {/* claims the first segment because wouter's parser never matches `/@:handle`, so it MUST stay declared after every real single- and two-segment route: Switch takes the first match, and this can then only see paths nothing else wanted */}
              <Route path='/:segment/:tab?'>
                {(params: { segment?: string, tab?: string }) => params.segment?.startsWith('@')
                  ? <ChannelRoute id={params.segment} base={`/${params.segment}`} word={params.tab} />
                  : <NotFound />}
              </Route>
              <Route component={NotFound} />
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
