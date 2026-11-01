import { describe, expect, it } from 'vite-plus/test'

import { descriptionMeta, formatAgo, formatCount, parseStartSeconds } from '../../../src/components/format'

describe('start offsets', () => {
  it('accepts both forms upstream mints for `t`', () => {
    expect(parseStartSeconds('90')).toBe(90)
    expect(parseStartSeconds('90s')).toBe(90)
    expect(parseStartSeconds('1h2m3s')).toBe(3723)
    expect(parseStartSeconds('1m30s')).toBe(90)
    expect(parseStartSeconds('2h')).toBe(7200)
    expect(parseStartSeconds('0')).toBe(0)
  })

  it('refuses anything that is not a position', () => {
    // Every group in the compound pattern is optional, so letters match it with all groups empty
    expect(parseStartSeconds('abc')).toBeUndefined()
    expect(parseStartSeconds('')).toBeUndefined()
    expect(parseStartSeconds(null)).toBeUndefined()
    expect(parseStartSeconds(undefined)).toBeUndefined()
    expect(parseStartSeconds('1x2')).toBeUndefined()
  })
})

describe('relative times', () => {
  const now = Date.parse('2026-11-01T12:00:00Z')

  it('words a time the way a card does', () => {
    expect(formatAgo('2026-11-01T11:59:30Z', now)).toBe('30 seconds ago')
    expect(formatAgo('2026-11-01T11:00:00Z', now)).toBe('1 hour ago')
    expect(formatAgo('2026-10-29T12:00:00Z', now)).toBe('3 days ago')
    expect(formatAgo('2026-10-11T12:00:00Z', now)).toBe('3 weeks ago')
    expect(formatAgo('2026-07-01T12:00:00Z', now)).toBe('4 months ago')
    expect(formatAgo('2024-10-01T12:00:00Z', now)).toBe('2 years ago')
  })

  it('reads a time in the future as now, and anything else as no time', () => {
    expect(formatAgo('2026-11-01T12:05:00Z', now)).toBe('0 seconds ago')
    expect(formatAgo('soon', now)).toBeUndefined()
    expect(formatAgo(undefined, now)).toBeUndefined()
  })

  it('counts in the singular only for one', () => {
    expect(formatCount(0, 'channel')).toBe('0 channels')
    expect(formatCount(1, 'channel')).toBe('1 channel')
    expect(formatCount(12, 'channel')).toBe('12 channels')
  })
})

describe('the description line', () => {
  const texts = {
    viewCountText: '1,832,711,164 views',
    shortViewCountText: '1.8B views',
    publishedDateText: 'Oct 25, 2009',
    relativeDateText: '17y ago',
  }

  it('shows the rounded count and the relative date while collapsed', () => {
    expect(descriptionMeta({ expanded: false, ...texts })).toBe('1.8B views  17y ago')
  })

  it('shows the exact count and date once expanded', () => {
    expect(descriptionMeta({ expanded: true, ...texts })).toBe('1,832,711,164 views  Oct 25, 2009')
  })

  it('falls back to whichever form upstream sent', () => {
    expect(descriptionMeta({ expanded: false, viewCountText: '12 views', publishedDateText: 'Oct 25, 2009' })).toBe('12 views  Oct 25, 2009')
    expect(descriptionMeta({ expanded: true, shortViewCountText: '1.8B views' })).toBe('1.8B views')
    expect(descriptionMeta({ expanded: true })).toBe('')
  })
})
