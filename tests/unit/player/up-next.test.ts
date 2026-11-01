import { describe, expect, it } from 'vite-plus/test'

import { closePlayer, getPlayerSession, openPlayer } from '../../../src/player/session'
import { endAction, hasNextInQueue, nextQueueIndex, pickAutoplay, previousQueueIndex } from '../../../src/player/up-next'

const STRAIGHT = { loop: false, shuffle: false }
const LOOP = { loop: true, shuffle: false }
const SHUFFLE = { loop: false, shuffle: true }

describe('the playlist queue', () => {
  it('steps to the next entry and stops at the end unless it loops', () => {
    expect(nextQueueIndex(0, 3, STRAIGHT)).toBe(1)
    expect(nextQueueIndex(2, 3, STRAIGHT)).toBeUndefined()
    expect(nextQueueIndex(2, 3, LOOP)).toBe(0)
    expect(nextQueueIndex(0, 1, LOOP)).toBeUndefined()
    expect(hasNextInQueue(2, 3, STRAIGHT)).toBe(false)
    expect(hasNextInQueue(2, 3, LOOP)).toBe(true)
  })

  it('never shuffles onto the video already playing', () => {
    for (let draw = 0; draw < 1; draw += 0.1) {
      expect(nextQueueIndex(2, 5, SHUFFLE, () => draw)).not.toBe(2)
    }
    expect(nextQueueIndex(0, 1, SHUFFLE, () => 0)).toBeUndefined()
  })

  it('steps back, wrapping only when it loops', () => {
    expect(previousQueueIndex(1, 3, STRAIGHT)).toBe(0)
    expect(previousQueueIndex(0, 3, STRAIGHT)).toBeUndefined()
    expect(previousQueueIndex(0, 3, LOOP)).toBe(2)
  })
})

describe('the autoplay pick', () => {
  const related = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

  it('takes the first related video that is not playing and not played', () => {
    expect(pickAutoplay(related, 'a', { played: new Set() })?.id).toBe('b')
    expect(pickAutoplay(related, 'x', { played: new Set(['a', 'b']) })?.id).toBe('c')
  })

  it('falls back to a played video rather than stopping', () => {
    expect(pickAutoplay(related, 'a', { played: new Set(['b', 'c']) })?.id).toBe('b')
    expect(pickAutoplay([{ id: 'a' }], 'a', { played: new Set() })).toBeUndefined()
  })

  it('prefers the video youtube.com itself would play, unless it has played already', () => {
    expect(pickAutoplay(related, 'a', { preferred: 'c', played: new Set() })?.id).toBe('c')
    expect(pickAutoplay(related, 'a', { preferred: 'c', played: new Set(['c']) })?.id).toBe('b')
    expect(pickAutoplay(related, 'a', { preferred: 'gone', played: new Set() })?.id).toBe('b')
    expect(pickAutoplay(related, 'c', { preferred: 'c', played: new Set() })?.id).toBe('a')
  })
})

describe('the end of a video', () => {
  const pick = { id: 'next' }

  it('moves straight on to a following playlist entry', () => {
    expect(endAction({ queued: true, autoplay: true, pick, cancelled: false })).toBe('advance')
    expect(endAction({ queued: true, autoplay: false, pick, cancelled: false })).toBe('advance')
    expect(endAction({ queued: true, autoplay: true, pick, cancelled: true })).toBe('advance')
  })

  it('counts down to the related pick with Autoplay on', () => {
    expect(endAction({ queued: false, autoplay: true, pick, cancelled: false })).toBe('countdown')
  })

  it('shows suggestions with Autoplay off, once cancelled, or with nothing to play', () => {
    expect(endAction({ queued: false, autoplay: false, pick, cancelled: false })).toBe('suggestions')
    expect(endAction({ queued: false, autoplay: true, pick, cancelled: true })).toBe('suggestions')
    expect(endAction({ queued: false, autoplay: true, pick: undefined, cancelled: false })).toBe('suggestions')
  })
})

describe('the player session', () => {
  it('takes a new queue for the video already playing without reopening it', () => {
    closePlayer()
    openPlayer({ videoId: 'v1', startAt: 30 })
    openPlayer({ videoId: 'v1', list: 'PL1', index: 4 })
    expect(getPlayerSession()).toMatchObject({ videoId: 'v1', startAt: 30, list: 'PL1', index: 4 })
    openPlayer({ videoId: 'v2', title: 'Two' })
    expect(getPlayerSession()).toMatchObject({ videoId: 'v2', list: undefined, index: undefined })
    closePlayer()
    expect(getPlayerSession().list).toBeUndefined()
  })
})
