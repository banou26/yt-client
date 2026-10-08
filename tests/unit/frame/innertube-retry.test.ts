import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

// youtubei.js as the frame sees it: a catalog build, then a player build that fetches /iframe_api and base.js
const youtube = vi.hoisted(() => ({
  builds: [] as ('catalog' | 'player')[],
  failCatalog: 0,
  failPlayer: 0,
}))

vi.mock('youtubei.js/web', () => {
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
    UniversalCache: class {},
    Utils: { generateRandomString: () => 'nonce' },
    YT: { VideoInfo: class { constructor() { return info } } },
    Innertube: {
      create: async (options: { retrieve_player: boolean }) => {
        const kind = options.retrieve_player ? 'player' : 'catalog'
        youtube.builds.push(kind)
        if (kind === 'catalog' && youtube.failCatalog-- > 0) throw new TypeError('Failed to fetch')
        if (kind === 'player' && youtube.failPlayer-- > 0) throw new TypeError('Failed to fetch')
        return { session: { context, player: { decipher: async (url: string) => url } }, actions: {} }
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
    const storage = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value) },
      removeItem: (key: string) => { storage.delete(key) },
    })
    vi.stubGlobal('fetch', async () => new Response('<script>var ytInitialPlayerResponse = {"videoDetails":{}};</script>'))
  })

  afterEach(() => {
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

  it('keeps a built session for every later playback', async () => {
    const { getSabrSource } = await loadFrame()
    await getSabrSource(VIDEO)
    await getSabrSource(VIDEO)
    expect(youtube.builds).toEqual(['catalog', 'player'])
  })
})
