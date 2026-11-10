import type { ChannelTab } from '../generated/graphql'

/** The last word of youtube.com's address for each channel tab: a tab opens at `/@handle/<word>`. */
export const CHANNEL_TAB_PATHS: Record<ChannelTab, string> = {
  HOME: 'featured',
  VIDEOS: 'videos',
  SHORTS: 'shorts',
  LIVE: 'streams',
  RELEASES: 'releases',
  PODCASTS: 'podcasts',
  COURSES: 'courses',
  SHOWS: 'shows',
  PLAYLISTS: 'playlists',
  COMMUNITY: 'posts',
  STORE: 'store',
  ABOUT: 'about',
  SEARCH: 'search',
}

const TABS = Object.keys(CHANNEL_TAB_PATHS) as ChannelTab[]

/** The tab an address word names, in any case. `community` is youtube.com's earlier word for Posts. */
export const channelTabFor = (word: string): ChannelTab | undefined => {
  const lower = word.toLowerCase()
  return lower === 'community' ? 'COMMUNITY' : TABS.find(tab => CHANNEL_TAB_PATHS[tab] === lower)
}
