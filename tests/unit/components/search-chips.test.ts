import { describe, expect, it } from 'vite-plus/test'

import { activeChip, chipSearch, SEARCH_CHIPS } from '../../../src/components/search-chips'

const chip = (id: string) => SEARCH_CHIPS.find(candidate => candidate.id === id)!
const params = (search: string) => new URLSearchParams(search)

describe('search chips', () => {
  it('names the chips youtube.com shows that a filter can say, in its order', () => {
    expect(SEARCH_CHIPS.map(candidate => candidate.label)).toEqual(['All', 'Shorts', 'Videos', 'Recently uploaded', 'Live'])
  })

  it('maps each chip to its filter', () => {
    const base = params('search_query=lofi')
    expect(chipSearch(base, chip('shorts'))).toBe('search_query=lofi&type=SHORTS')
    expect(chipSearch(base, chip('videos'))).toBe('search_query=lofi&type=VIDEO')
    expect(chipSearch(base, chip('recent'))).toBe('search_query=lofi&upload_date=WEEK')
    expect(chipSearch(base, chip('live'))).toBe('search_query=lofi&features=LIVE')
  })

  it('swaps one chip for another and keeps duration and sort', () => {
    const from = params('search_query=lofi&type=SHORTS&duration=OVER_TWENTY_MINS&sort=POPULARITY')
    expect(chipSearch(from, chip('live'))).toBe('search_query=lofi&duration=OVER_TWENTY_MINS&sort=POPULARITY&features=LIVE')
    expect(chipSearch(from, chip('all'))).toBe('search_query=lofi&duration=OVER_TWENTY_MINS&sort=POPULARITY')
  })

  it('lights the chip the filters amount to', () => {
    expect(activeChip(params('search_query=lofi'))).toBe('all')
    expect(activeChip(params('search_query=lofi&duration=OVER_TWENTY_MINS'))).toBe('all')
    expect(activeChip(params('search_query=lofi&type=VIDEO'))).toBe('videos')
    expect(activeChip(params('search_query=lofi&upload_date=WEEK'))).toBe('recent')
    expect(activeChip(params('search_query=lofi&features=LIVE'))).toBe('live')
  })

  it('lights none when the filters match no single chip', () => {
    expect(activeChip(params('search_query=lofi&type=CHANNEL'))).toBeUndefined()
    expect(activeChip(params('search_query=lofi&upload_date=TODAY'))).toBeUndefined()
    expect(activeChip(params('search_query=lofi&features=LIVE,HD'))).toBeUndefined()
    expect(activeChip(params('search_query=lofi&type=VIDEO&features=LIVE'))).toBeUndefined()
  })
})
