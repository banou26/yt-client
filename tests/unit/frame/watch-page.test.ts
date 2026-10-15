import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { readPageChallenge } from '../../../src/frame/watch-page'
import { GLOBAL_NAME, PROGRAM } from '../engine/agent-fakes'
import { streamed, watchPage } from './watch-page-fakes'

const CHALLENGE = {
  config: { EVENT_ID: 'event-1', INNERTUBE_CONTEXT_CLIENT_VERSION: '2.20261008.00.00' },
  program: PROGRAM,
  globalName: GLOBAL_NAME,
  interpreterUrl: 'https://www.google.com/js/th/interpreter.js',
}

const immediate = () => new Promise((resolve) => { setImmediate(resolve) })

describe("a watch page's challenge", () => {
  it('reads the challenge and the first ytcfg of the page', () => {
    expect(readPageChallenge(watchPage())).toEqual(CHALLENGE)
  })

  it('is undefined at every cut of the page before the end of its challenge', () => {
    const page = watchPage()
    const end = page.indexOf('\'});</script>', page.indexOf('window.ytAtN')) + 1
    for (let cut = 0; cut < end; cut++) expect(readPageChallenge(page.slice(0, cut))).toBeUndefined()
    expect(readPageChallenge(page.slice(0, end))).toEqual(CHALLENGE)
  })

  it('throws on a challenge with no program, and on a page with no ytcfg', () => {
    expect(() => readPageChallenge(watchPage().replace(PROGRAM, ''))).toThrow('the watch page\'s challenge is incomplete')
    expect(() => readPageChallenge(watchPage().replace(/ytcfg\.set/g, 'other.set'))).toThrow('the watch page carries no ytcfg')
  })
})

describe('reading a watch page', () => {
  let pages: string[]
  let statuses: number[]
  let fetched: string[]

  beforeEach(() => {
    vi.resetModules()
    pages = []
    statuses = []
    fetched = []
    vi.stubGlobal('fetch', async (url: string) => {
      fetched.push(url)
      const status = statuses.shift()
      if (status !== undefined) return new Response('<html>an error page</html>', { status })
      return streamed([pages.shift() ?? watchPage({ eventId: `event-${fetched.length}` })])
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('answers the player response before the challenge has arrived, and keeps the challenge for the next session', async () => {
    let send: (text: string) => void = () => {}
    let close = () => {}
    vi.stubGlobal('fetch', async () => new Response(new ReadableStream({
      start: (controller) => {
        send = (text) => controller.enqueue(new TextEncoder().encode(text))
        close = () => controller.close()
      },
    })))
    const { fetchPlayerResponse, takePageChallenge } = await import('../../../src/frame/watch-page')
    const page = watchPage()
    const split = page.indexOf('window.ytAtN')
    const player = fetchPlayerResponse('video-1')
    let challenge: unknown
    void takePageChallenge().then((value) => { challenge = value })
    send(page.slice(0, split))
    expect(await player).toEqual({ videoDetails: { videoId: 'video-1', title: 'a {brace} and a "quote"' } })
    await immediate()
    expect(challenge).toBeUndefined()
    send(page.slice(split))
    close()
    for (let tries = 0; tries < 50 && challenge === undefined; tries++) await immediate()
    expect(challenge).toEqual(CHALLENGE)
  })

  it('reads a page streamed in chunks of any size', async () => {
    const page = watchPage()
    const chunks: string[] = []
    for (let start = 0; start < page.length; start += 7) chunks.push(page.slice(start, start + 7))
    vi.stubGlobal('fetch', async () => streamed(chunks))
    const { fetchPlayerResponse, takePageChallenge } = await import('../../../src/frame/watch-page')
    await fetchPlayerResponse('video-1')
    expect(await takePageChallenge()).toEqual(CHALLENGE)
  })

  it('reads a page whose response has no body stream', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: true, status: 200, body: null, text: async () => watchPage() }))
    const { fetchPlayerResponse, takePageChallenge } = await import('../../../src/frame/watch-page')
    expect(await fetchPlayerResponse('video-1')).toHaveProperty('videoDetails')
    expect(await takePageChallenge()).toEqual(CHALLENGE)
  })

  it('a session that finds the last page taken reads the last video\'s page again', async () => {
    const { fetchPlayerResponse, takePageChallenge } = await import('../../../src/frame/watch-page')
    await fetchPlayerResponse('video-1')
    expect((await takePageChallenge()).config.EVENT_ID).toBe('event-1')
    expect((await takePageChallenge()).config.EVENT_ID).toBe('event-2')
    expect(fetched).toEqual(['https://www.youtube.com/watch?v=video-1', 'https://www.youtube.com/watch?v=video-1'])
  })

  it('takes the page read last, not an earlier one no session took', async () => {
    const { fetchPlayerResponse, takePageChallenge } = await import('../../../src/frame/watch-page')
    await fetchPlayerResponse('video-1')
    await fetchPlayerResponse('video-2')
    expect((await takePageChallenge()).config.EVENT_ID).toBe('event-2')
    expect(fetched).toHaveLength(2)
  })

  it('a session started before any watch page was read waits for the first', async () => {
    const { fetchPlayerResponse, takePageChallenge } = await import('../../../src/frame/watch-page')
    let challenge: unknown
    void takePageChallenge().then((value) => { challenge = value })
    await immediate()
    expect(challenge).toBeUndefined()
    expect(fetched).toEqual([])
    await fetchPlayerResponse('video-1')
    for (let tries = 0; tries < 50 && challenge === undefined; tries++) await immediate()
    expect(challenge).toEqual(CHALLENGE)
    expect(fetched).toHaveLength(1)
  })

  it('a page with no challenge still answers its player response, and the session that takes it fails', async () => {
    pages.push(watchPage({ challenge: false }))
    const { fetchPlayerResponse, takePageChallenge } = await import('../../../src/frame/watch-page')
    expect(await fetchPlayerResponse('video-1')).toHaveProperty('videoDetails')
    await expect(takePageChallenge()).rejects.toThrow('youtube: the watch page carries no challenge')
  })

  it('a page with no player response fails both', async () => {
    pages.push('<html></html>')
    const { fetchPlayerResponse, takePageChallenge } = await import('../../../src/frame/watch-page')
    await expect(fetchPlayerResponse('video-1')).rejects.toThrow('youtube: player response is missing')
    await expect(takePageChallenge()).rejects.toThrow('youtube: player response is missing')
  })

  it.each([429, 500, 503])('reads the page again after a %i, and answers both from the page that follows', async (status) => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    statuses.push(status)
    const { fetchPlayerResponse, takePageChallenge } = await import('../../../src/frame/watch-page')
    const player = fetchPlayerResponse('video-1')
    await vi.advanceTimersByTimeAsync(499)
    expect(fetched).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(await player).toHaveProperty('videoDetails')
    expect((await takePageChallenge()).config.EVENT_ID).toBe('event-2')
    expect(fetched).toEqual(['https://www.youtube.com/watch?v=video-1', 'https://www.youtube.com/watch?v=video-1'])
  })

  it('a status that keeps coming back fails both with that status after three reads, never as a missing player response', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    statuses.push(429, 429, 429, 429)
    const { fetchPlayerResponse, takePageChallenge } = await import('../../../src/frame/watch-page')
    const player = fetchPlayerResponse('video-1')
    void player.catch(() => {})
    await vi.advanceTimersByTimeAsync(1_499)
    expect(fetched).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1)
    await expect(player).rejects.toThrow('youtube: the watch page returned 429')
    await expect(takePageChallenge()).rejects.toThrow('youtube: the watch page returned 429')
    expect(fetched).toHaveLength(3)
  })

  it('a status that is neither 429 nor 5xx fails at once, with that status', async () => {
    statuses.push(404)
    const { fetchPlayerResponse } = await import('../../../src/frame/watch-page')
    await expect(fetchPlayerResponse('video-1')).rejects.toThrow('youtube: the watch page returned 404')
    expect(fetched).toHaveLength(1)
  })
})
