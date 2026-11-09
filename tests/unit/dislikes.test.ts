import { describe, expect, it } from 'vite-plus/test'

import { parseDislikes } from '../../src/dislikes'

// returnyoutubedislikeapi.com/votes answers, recorded 2026-11-09
const RICK_ROLL = { id: 'dQw4w9WgXcQ', dateCreated: '2022-04-09T22:01:38.222268Z', likes: 19496469, rawDislikes: 6720, rawLikes: 130554, dislikes: 521680, rating: 4.895758593863998, viewCount: 1835084823, deleted: false }
const NEVER_SEEN = { id: 'AAAAAAAAAAA', dateCreated: '2026-11-09T12:24:15.3920309Z', likes: 0, rawDislikes: null, rawLikes: null, dislikes: 0, rating: 0, viewCount: 0, deleted: false }
const BAD_ID = { type: 'https://tools.ietf.org/html/rfc9110#section-15.5.1', title: 'Bad Request', status: 400, traceId: '00-0427dc1581afff9bf6b33e649d845d58-bfd56a5f6bda1875-00' }

describe('a Return YouTube Dislike answer', () => {
  it('gives its dislike count', () => {
    expect(parseDislikes(RICK_ROLL)).toBe(521680)
  })

  it('gives nothing for a video the service has never seen', () => {
    expect(parseDislikes(NEVER_SEEN)).toBeUndefined()
  })

  it('gives 0 for a liked video nobody disliked', () => {
    expect(parseDislikes({ ...RICK_ROLL, rawDislikes: 0, dislikes: 0 })).toBe(0)
  })

  it('gives nothing for an error or a malformed answer', () => {
    expect(parseDislikes(BAD_ID)).toBeUndefined()
    expect(parseDislikes(null)).toBeUndefined()
    expect(parseDislikes('521680')).toBeUndefined()
    expect(parseDislikes({ ...RICK_ROLL, dislikes: '521680' })).toBeUndefined()
    expect(parseDislikes({ ...RICK_ROLL, dislikes: -1 })).toBeUndefined()
    expect(parseDislikes({ ...RICK_ROLL, dislikes: Number.NaN })).toBeUndefined()
  })
})
