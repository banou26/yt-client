import { describe, expect, it } from 'vite-plus/test'

import { hashPrefix, parseSegments, skipTarget } from '../../../src/player/sponsorblock'
// four of the 58 videos in SponsorBlock's answer for 6745?categories=["sponsor"]&actionTypes=["skip"], recorded 2026-11-09
import bucket from '../fixtures/sponsorblock-6745.json'

// kxOuG8jMIgI's entry in an answer that asked for every category and action type, recorded 2026-11-09
const NO_SPONSOR = [{
  videoID: 'kxOuG8jMIgI',
  segments: [
    { category: 'filler', actionType: 'skip', segment: [171.733, 175.191], videoDuration: 182.721 },
    { category: 'outro', actionType: 'skip', segment: [179.246, 182.721], videoDuration: 182.721 },
    { category: 'poi_highlight', actionType: 'poi', segment: [145.757, 145.757], videoDuration: 182.721 },
  ],
}]

describe('hashPrefix', () => {
  it('is the first 4 hex characters of the SHA-256 of the id', async () => {
    expect(await hashPrefix('jNQXAC9IVRw')).toBe('6745')
    expect(await hashPrefix('dQw4w9WgXcQ')).toBe('5f6b')
  })
})

describe('parseSegments', () => {
  it('keeps only the video asked for, out of every video sharing its prefix', () => {
    expect(parseSegments(bucket, '2UG04RqWD8E')).toEqual([{ start: 26.743, end: 93.672 }])
    expect(parseSegments(bucket, 'jNQXAC9IVRw')).toEqual([])
  })

  it('keeps only sponsors to skip', () => {
    expect(parseSegments(NO_SPONSOR, 'kxOuG8jMIgI')).toEqual([])
  })

  it('reads an answer with no parts, or no answer at all, as none', () => {
    for (const answer of [[], null, 'Not Found', { videoID: '2UG04RqWD8E' }]) expect(parseSegments(answer, '2UG04RqWD8E')).toEqual([])
  })

  it('sorts the parts by start and drops one that ends before it starts', () => {
    const sponsor = (segment: unknown) => ({ category: 'sponsor', actionType: 'skip', segment })
    const answer = [{ videoID: 'a', segments: [sponsor([40, 50]), sponsor([30, 20]), sponsor([5, 9]), sponsor(['5', 9])] }]
    expect(parseSegments(answer, 'a')).toEqual([{ start: 5, end: 9 }, { start: 40, end: 50 }])
  })
})

describe('skipTarget', () => {
  const first = { start: 5, end: 8 }
  const second = { start: 8, end: 12 }
  const later = { start: 30, end: 40 }
  const segments = [first, second, later]

  it('jumps from inside a part to its end, on through a part that starts where it ends', () => {
    expect(skipTarget(segments, 31, new Set())).toBe(40)
    expect(skipTarget(segments, 5.2, new Set())).toBe(12)
  })

  it('leaves playback outside every part alone', () => {
    expect(skipTarget(segments, 4.9, new Set())).toBeUndefined()
    expect(skipTarget(segments, 12, new Set())).toBeUndefined()
    expect(skipTarget(segments, 45, new Set())).toBeUndefined()
  })

  it('plays an excused part, and stops a chain at one', () => {
    expect(skipTarget(segments, 31, new Set([later]))).toBeUndefined()
    expect(skipTarget(segments, 5.2, new Set([second]))).toBe(8)
  })
})
