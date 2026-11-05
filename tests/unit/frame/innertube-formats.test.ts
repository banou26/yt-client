import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test'

// the real youtubei.js parses the player response, so a renamed Format field shows here; only the sessions are faked
vi.mock('youtubei.js/web', async (importOriginal) => {
  const actual = await importOriginal<typeof import('youtubei.js/web')>()
  const context = {
    client: { visitorData: 'visitor', clientVersion: '2.20261008.00.00', clientName: 'WEB', osName: 'X11', osVersion: '', userAgent: 'agent' },
  }
  return {
    ...actual,
    Innertube: {
      create: async () => ({ session: { context, player: { decipher: async (url: string) => url } }, actions: {} }),
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

vi.mock('../../../src/frame/egress', () => ({ egressFetch: vi.fn(async () => new Response(null)) }))

const VIDEO = 'jfKfPfyJRdk'

const livePlayerResponse = {
  playabilityStatus: { status: 'OK' },
  videoDetails: { videoId: VIDEO, title: 'lofi hip hop radio', lengthSeconds: '0', isLive: true, isLiveContent: true },
  streamingData: {
    serverAbrStreamingUrl: 'https://rr1.googlevideo.com/videoplayback?id=1',
    adaptiveFormats: [
      { itag: 299, mimeType: 'video/mp4; codecs="avc1.64002a"', bitrate: 6_000_000, width: 1920, height: 1080, qualityLabel: '1080p60', targetDurationSec: 2 },
      { itag: 140, mimeType: 'audio/mp4; codecs="mp4a.40.2"', bitrate: 128_000, audioQuality: 'AUDIO_QUALITY_MEDIUM', targetDurationSec: 2 },
    ],
  },
  playerConfig: { mediaCommonConfig: { mediaUstreamerRequestConfig: { videoPlaybackUstreamerConfig: 'config' } } },
}

beforeEach(() => {
  vi.resetModules()
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value) },
    removeItem: (key: string) => { storage.delete(key) },
  })
  vi.stubGlobal('fetch', async () => new Response(`<script>var ytInitialPlayerResponse = ${JSON.stringify(livePlayerResponse)};</script>`))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// the SABR loop paces live segment requests off this, and without it falls back to 5 s for every stream
it("hands a live format's target duration to the SABR session", async () => {
  const { getSabrSource } = await import('../../../src/frame/innertube')
  const source = await getSabrSource(VIDEO)
  expect(source.isLive).toBe(true)
  expect(source.playbackFormats.map((format) => [format.itag, format.targetDurationMs])).toEqual([[299, 2_000], [140, 2_000]])
})
