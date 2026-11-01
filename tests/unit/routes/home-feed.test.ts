import type { HomeFeedPage } from '../../../src/routes/home-feed'

import { describe, expect, it } from 'vite-plus/test'

import { homeFeedPages } from '../../../src/routes/home-feed'

const feedPage = (cursor: string, shorts: string[]) => ({
  items: [],
  shorts: shorts.map(id => ({ id })),
  chips: [],
  cursor,
}) as unknown as HomeFeedPage

const shortIds = (feed: ReturnType<typeof homeFeedPages>) => feed.shorts.map(entry => entry.items.map(short => short.id))

describe('home feed pages', () => {
  const loaded = [feedPage('c1', ['s1']), feedPage('c2', ['s2'])]

  it('adds the page in hand after the loaded ones', () => {
    const page = feedPage('c3', ['s3'])
    const feed = homeFeedPages(loaded, page)
    expect(feed.videos).toEqual([...loaded, page])
    expect(shortIds(feed)).toEqual([['s1'], ['s2'], ['s3']])
    expect(feed.shorts.map(entry => entry.cursor)).toEqual(['c1', 'c2', 'c3'])
  })

  it('keeps the loaded videos and shorts when a continuation fails', () => {
    const feed = homeFeedPages(loaded, undefined)
    expect(feed.videos).toEqual(loaded)
    expect(shortIds(feed)).toEqual([['s1'], ['s2']])
  })
})
