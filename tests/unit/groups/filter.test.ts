import { describe, expect, it } from 'vite-plus/test'

import { EMPTY_PAGES_LIMIT, emptyPagesInARow, matchesFilter } from '../../../src/groups/filter'

const item = (id: string, channelId: string | undefined, extra: { isLive?: boolean, progressPercent?: number } = {}) =>
  ({ id, channel: channelId ? { id: channelId } : undefined, ...extra })

const FEED = [
  item('a1', 'UCa'),
  item('b1', 'UCb'),
  item('a-live', 'UCa', { isLive: true }),
  item('a-watched', 'UCa', { progressPercent: 100 }),
  item('a-started', 'UCa', { progressPercent: 30 }),
  item('no-channel', undefined),
]

const ids = (filter: Parameters<typeof matchesFilter>[1]) =>
  FEED.filter(entry => matchesFilter(entry, filter)).map(entry => entry.id)

describe('subscriptions filter', () => {
  it('keeps everything with nothing chosen', () => {
    expect(ids({})).toEqual(FEED.map(entry => entry.id))
  })

  it('keeps only the channels of the chosen group', () => {
    expect(ids({ channelIds: new Set(['UCa']) })).toEqual(['a1', 'a-live', 'a-watched', 'a-started'])
    expect(ids({ channelIds: new Set() })).toEqual([])
  })

  it('hides live videos, and watched ones but not those left part way', () => {
    expect(ids({ hideLive: true })).not.toContain('a-live')
    expect(ids({ hideWatched: true })).toEqual(['a1', 'b1', 'a-live', 'a-started', 'no-channel'])
    expect(ids({ channelIds: new Set(['UCa']), hideLive: true, hideWatched: true })).toEqual(['a1', 'a-started'])
  })
})

describe('automatic paging', () => {
  const page = (...channelIds: string[]) => ({ items: channelIds.map((channelId, index) => item(`${channelId}-${index}`, channelId)) })
  const group = { channelIds: new Set(['UCa']) }

  it('counts the newest pages in a row with no match', () => {
    expect(emptyPagesInARow([page('UCa'), page('UCb'), page('UCb')], group)).toBe(2)
    expect(emptyPagesInARow([page('UCb'), page('UCa', 'UCb')], group)).toBe(0)
    expect(emptyPagesInARow([], group)).toBe(0)
  })

  it('reaches the limit after five empty pages, and a match starts the count again', () => {
    const empty = Array.from({ length: EMPTY_PAGES_LIMIT }, () => page('UCb', 'UCc'))
    expect(EMPTY_PAGES_LIMIT).toBe(5)
    expect(emptyPagesInARow([page('UCa'), ...empty.slice(1)], group)).toBeLessThan(EMPTY_PAGES_LIMIT)
    expect(emptyPagesInARow([page('UCa'), ...empty], group)).toBe(EMPTY_PAGES_LIMIT)
    expect(emptyPagesInARow([...empty, page('UCa')], group)).toBe(0)
  })
})
