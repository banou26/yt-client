import type { HomeFeedQuery } from '../generated/graphql'

export type HomeFeedPage = HomeFeedQuery['home']

// page is undefined after a failed continuation as well, and the pages already loaded stay, shorts included
export const homeFeedPages = (pages: HomeFeedPage[], page: HomeFeedPage | undefined) => {
  const videos = page ? [...pages, page] : pages
  return { videos, shorts: videos.map(entry => ({ items: entry.shorts, cursor: entry.cursor })) }
}
