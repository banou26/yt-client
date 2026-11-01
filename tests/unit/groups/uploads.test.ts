import { describe, expect, it } from 'vite-plus/test'

import { mergeUploads } from '../../../src/groups/uploads'

const upload = (id: string, publishedAt?: string, viewCount?: string) => ({ id, publishedAt, viewCount })

const ALPHA = [
  upload('a-new', '2026-10-30T10:00:00Z', '100'),
  upload('a-old', '2026-10-01T10:00:00Z', '9000'),
]
// feed order is not date order upstream, so a list is never assumed sorted
const BETA = [
  upload('b-mid', '2026-10-15T10:00:00Z', '500'),
  upload('b-newest', '2026-10-31T10:00:00Z', '500'),
  upload('b-undated', undefined, '7'),
]

describe('merged group uploads', () => {
  it('lists every channel newest first', () => {
    expect(mergeUploads([ALPHA, BETA], 'latest').map(video => video.id))
      .toEqual(['b-newest', 'a-new', 'b-mid', 'a-old', 'b-undated'])
  })

  it('lists the most viewed first, the newest first on a tie', () => {
    expect(mergeUploads([ALPHA, BETA], 'popular').map(video => video.id))
      .toEqual(['a-old', 'b-newest', 'b-mid', 'a-new', 'b-undated'])
  })

  it('keeps a video two channels share once', () => {
    const shared = upload('a-new', '2026-10-30T10:00:00Z', '100')
    const merged = mergeUploads([ALPHA, [shared, ...BETA]], 'latest')
    expect(merged.filter(video => video.id === 'a-new')).toHaveLength(1)
    expect(merged).toHaveLength(5)
  })

  it('grows as more channels land', () => {
    expect(mergeUploads([ALPHA], 'latest').map(video => video.id)).toEqual(['a-new', 'a-old'])
    expect(mergeUploads([], 'latest')).toEqual([])
  })
})
