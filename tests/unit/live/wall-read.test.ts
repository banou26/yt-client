import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import { held, tokenStored, unpassed } from '../../live/wall-read'

const seek = { target: 90 }

describe('a seek window that read no pass', () => {
  it('reads a wall or an inconclusive only from a session that held to the end of the window (control)', () => {
    expect(unpassed({ ...seek, maxBuffered: 20, ended: null }).verdict).toBe('wall')
    expect(unpassed({ ...seek, maxBuffered: 80, ended: null }).verdict).toBe('inconclusive')
  })

  it('refuses a session that ended after the seek, whatever it had buffered, since its buffer went with it', () => {
    const ended = { s: 3.2, status: 'Retrying playback' }
    expect(unpassed({ ...seek, maxBuffered: 20, ended })).toEqual({
      verdict: 'refused',
      reason: 'the first session ended 3.2s after the seek: Retrying playback, having buffered to 20',
    })
    expect(unpassed({ ...seek, maxBuffered: 80, ended: { s: 1, status: null } }).verdict).toBe('refused')
  })
})

describe('a control', () => {
  it('holds or fails on a pass or a wall (control)', () => {
    expect([held('detector', 'pass'), held('detector', 'wall')]).toEqual(['true', 'false'])
    expect([held('webdriver', 'wall'), held('webdriver', 'pass')]).toEqual(['true', 'false'])
  })

  it('reads neither held nor failed when the run reached no verdict', () => {
    for (const verdict of ['refused', 'inconclusive', 'no-playback', 'error', null] as const) {
      expect([held('detector', verdict), held('webdriver', verdict)]).toEqual(['-', '-'])
    }
  })
})

describe('the token store reading', () => {
  afterEach(() => void vi.useRealTimers())

  it('reads presence, and an evaluate that throws as unknown (control)', async () => {
    expect(await tokenStored({ evaluate: async () => true })).toBe(true)
    expect(await tokenStored({ evaluate: async () => false })).toBe(false)
    expect(await tokenStored({ evaluate: async () => { throw new Error('target closed') } })).toBe(null)
  })

  it('reads a page that never answers as unknown within 2 s, rather than holding the run open', async () => {
    vi.useFakeTimers()
    let read: boolean | null | 'pending' = 'pending'
    void tokenStored({ evaluate: () => new Promise<boolean>(() => {}) }).then(value => { read = value })
    await vi.advanceTimersByTimeAsync(2_000)
    expect(read).toBe(null)
  })
})
