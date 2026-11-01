type FeedItem = {
  channel?: { id: string } | null
  isLive?: boolean | null
  progressPercent?: number | null
}

/** What the Subscriptions page keeps: the channels of one group (all channels when absent), less live and watched videos when asked. */
export type FeedFilter = {
  channelIds?: ReadonlySet<string>
  hideLive?: boolean
  hideWatched?: boolean
}

// a resume bar this far along reads as watched, so a video left part way through stays in the feed
const WATCHED_PERCENT = 90

/** Automatic paging stops once this many pages in a row held nothing the filter keeps. */
export const EMPTY_PAGES_LIMIT = 5

export const matchesFilter = (item: FeedItem, { channelIds, hideLive, hideWatched }: FeedFilter) =>
  (!channelIds || (item.channel != null && channelIds.has(item.channel.id)))
  && !(hideLive && item.isLive === true)
  && !(hideWatched && (item.progressPercent ?? 0) >= WATCHED_PERCENT)

/** How many of the newest pages, counted back from the last one, hold nothing the filter keeps. */
export const emptyPagesInARow = (pages: { items: FeedItem[] }[], filter: FeedFilter) => {
  let count = 0
  for (let index = pages.length - 1; index >= 0; index--) {
    if (pages[index]!.items.some(item => matchesFilter(item, filter))) break
    count++
  }
  return count
}
