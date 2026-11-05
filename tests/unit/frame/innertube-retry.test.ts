import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { streamed, watchPage } from './watch-page-fakes'

// youtubei.js as the frame sees it: a catalog build, then a player build that fetches /iframe_api and base.js
const youtube = vi.hoisted(() => ({
  builds: [] as ('catalog' | 'player')[],
  failCatalog: 0,
  failPlayer: 0,
  pagePlayers: [] as string[],
  failPagePlayer: 0,
  playerSession: undefined as { cache?: unknown, fetch?: unknown } | undefined,
  pagePlayerFrom: [] as { cache: unknown, fetch: unknown }[],
}))

vi.mock('youtubei.js/web', () => {
  // a player marks what it deciphered, so a test can read which one did
  const player = (id: string) => ({ player_id: id, decipher: async (url: string) => `${url}&player=${id}` })
  const context = {
    client: { visitorData: 'visitor', clientVersion: '2.20261008.00.00', clientName: 'WEB', osName: 'X11', osVersion: '', userAgent: 'agent' },
  }
  const info = {
    playability_status: { status: 'OK' },
    basic_info: { is_live: false, duration: 213 },
    streaming_data: { server_abr_streaming_url: 'https://rr1.googlevideo.com/videoplayback?id=1', adaptive_formats: [] },
    player_config: { media_common_config: { media_ustreamer_request_config: { video_playback_ustreamer_config: 'config' } } },
    toDash: async () => '<MPD/>',
  }
  return {
    Constants: { CLIENTS: { WEB: { VERSION: '' } }, CLIENT_NAME_IDS: { WEB: '1' } },
    Platform: { shim: {} },
    Player: {
      create: async (cache: unknown, fetch: unknown, _token: unknown, id: string) => {
        youtube.pagePlayers.push(id)
        youtube.pagePlayerFrom.push({ cache, fetch })
        if (youtube.failPagePlayer-- > 0) throw new Error('Failed to get player data: 404')
        return player(id)
      },
    },
    UniversalCache: class {},
    Utils: { generateRandomString: () => 'nonce' },
    YT: { VideoInfo: class { constructor() { return info } } },
    Innertube: {
      create: async (options: { retrieve_player: boolean, cache?: unknown, fetch?: unknown }) => {
        const kind = options.retrieve_player ? 'player' : 'catalog'
        youtube.builds.push(kind)
        if (kind === 'catalog' && youtube.failCatalog-- > 0) throw new TypeError('Failed to fetch')
        if (kind === 'player' && youtube.failPlayer-- > 0) throw new TypeError('Failed to fetch')
        if (kind === 'player') youtube.playerSession = options
        // the session keeps the cache and the fetch it was built with, as youtubei.js's Session and HTTPClient do
        return { session: { context, cache: options.cache, http: { fetch_function: options.fetch }, player: player('ef321720') }, actions: {} }
      },
    },
  }
})

vi.mock('../../../src/frame/botguard', () => ({
  mintPoToken: vi.fn(),
  recoverPoTokenSession: vi.fn(),
  warmPoTokenSession: vi.fn(),
  clearStoredTokens: vi.fn(),
  resetPoTokenSession: vi.fn(),
}))

vi.mock('../../../src/frame/egress', () => ({ egressFetch: vi.fn() }))

const VIDEO = 'dQw4w9WgXcQ'

// lets the builds the module starts on load settle, failures included
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

const loadFrame = async () => {
  const module = await import('../../../src/frame/innertube')
  await settle()
  return module
}

describe('the frame Innertube sessions', () => {
  beforeEach(() => {
    vi.resetModules()
    youtube.builds = []
    youtube.failCatalog = 0
    youtube.failPlayer = 0
    youtube.pagePlayers = []
    youtube.failPagePlayer = 0
    youtube.playerSession = undefined
    youtube.pagePlayerFrom = []
    const storage = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value) },
      removeItem: (key: string) => { storage.delete(key) },
    })
    vi.stubGlobal('fetch', async () => new Response('<script>var ytInitialPlayerResponse = {"videoDetails":{}};</script>'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('builds the player session again after one build failed, in the same frame', async () => {
    youtube.failPlayer = 1
    const { getSabrSource } = await loadFrame()
    expect(youtube.builds).toEqual(['catalog', 'player'])
    const source = await getSabrSource(VIDEO)
    expect(source.streamingUrl).toContain('rr1.googlevideo.com/videoplayback')
    expect(youtube.builds).toEqual(['catalog', 'player', 'player'])
  })

  it('builds the catalog and the player sessions again after the catalog build failed', async () => {
    youtube.failCatalog = 1
    const { getSabrSource } = await loadFrame()
    expect(youtube.builds).toEqual(['catalog'])
    const source = await getSabrSource(VIDEO)
    expect(source.videoId).toBe(VIDEO)
    expect(youtube.builds).toEqual(['catalog', 'catalog', 'player'])
  })

  it("a playback's watch read keeps the page's challenge for the BotGuard session, with no second read", async () => {
    const fetched: string[] = []
    vi.stubGlobal('fetch', async (url: string) => {
      fetched.push(url)
      return streamed([watchPage()])
    })
    const { getSabrSource } = await loadFrame()
    const { takePageChallenge } = await import('../../../src/frame/watch-page')
    await getSabrSource(VIDEO)
    const taken = await Promise.race([takePageChallenge(), new Promise((resolve) => setTimeout(() => resolve('still waiting'), 100))])
    expect(taken).toMatchObject({ config: { EVENT_ID: 'event-1' } })
    expect(fetched).toEqual([`https://www.youtube.com/watch?v=${VIDEO}`])
  })

  describe('deciphering the stream URL', () => {
    const decipheredBy = async (getSabrSource: (videoId: string) => Promise<{ streamingUrl: string }>) =>
      new URL((await getSabrSource(VIDEO)).streamingUrl).searchParams.get('player')

    const servePage = (playerId?: string) => vi.stubGlobal('fetch', async () => streamed([watchPage({
      playerJsUrl: playerId && `\\/s\\/player\\/${playerId}\\/player_ias.vflset\\/en_US\\/base.js`,
    })]))

    it("uses the watch page's player when it is another than the session's, built once through the session's fetch and cache", async () => {
      servePage('a5c2aafe')
      const { getSabrSource } = await loadFrame()
      expect(await decipheredBy(getSabrSource)).toBe('a5c2aafe')
      expect(await decipheredBy(getSabrSource)).toBe('a5c2aafe')
      expect(youtube.pagePlayers).toEqual(['a5c2aafe'])
      const [from] = youtube.pagePlayerFrom
      expect(from?.fetch).toBeTypeOf('function')
      expect(from?.fetch).toBe(youtube.playerSession?.fetch)
      expect(from?.cache).toBeTypeOf('object')
      expect(from?.cache).toBe(youtube.playerSession?.cache)
    })

    it.each([['the same player', 'ef321720'], ['no player', undefined]])("uses the session's player for a page naming %s", async (_, playerId) => {
      servePage(playerId)
      const { getSabrSource } = await loadFrame()
      expect(await decipheredBy(getSabrSource)).toBe('ef321720')
      expect(youtube.pagePlayers).toEqual([])
    })

    it("uses the session's player when the page's fails to build, and builds it again for the next playback", async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      youtube.failPagePlayer = 1
      servePage('a5c2aafe')
      const { getSabrSource } = await loadFrame()
      expect(await decipheredBy(getSabrSource)).toBe('ef321720')
      expect(await decipheredBy(getSabrSource)).toBe('a5c2aafe')
      expect(youtube.pagePlayers).toEqual(['a5c2aafe', 'a5c2aafe'])
    })
  })

  it('keeps a built session for every later playback', async () => {
    const { getSabrSource } = await loadFrame()
    await getSabrSource(VIDEO)
    await getSabrSource(VIDEO)
    expect(youtube.builds).toEqual(['catalog', 'player'])
  })
})
