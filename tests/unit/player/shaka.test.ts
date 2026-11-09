import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import type { FrameApi } from '../../../src/frame/protocol'
import { STREAM_REFUSED } from '../../../src/frame/protocol'
import { startShakaPlayback } from '../../../src/player/shaka'

// Shaka as startShakaPlayback reaches it: a player that loads anything and reports errors as events
const fake = vi.hoisted(() => {
  class ShakaError extends Error {
    static Severity = { RECOVERABLE: 1, CRITICAL: 2 }
    static Category = { NETWORK: 1 }
    static Code = { HTTP_ERROR: 1002, OPERATION_ABORTED: 7001 }
    data: unknown[]
    constructor(readonly severity: number, readonly category: number, readonly code: number, ...data: unknown[]) {
      super(`shaka error ${code}`)
      this.data = data
    }
  }
  const players: Player[] = []
  class Player extends EventTarget {
    static isBrowserSupported = () => true
    destroyed = false
    networking = { registerRequestFilter: () => {}, unregisterRequestFilter: () => {} }
    constructor() {
      super()
      players.push(this)
    }
    getNetworkingEngine = () => this.networking
    configure = () => {}
    attach = async () => {}
    load = async () => {}
    destroy = async () => { this.destroyed = true }
  }
  const shaka = {
    polyfill: { installAll: () => {} },
    Player,
    util: { Error: ShakaError, AbortableOperation: class {} },
    net: { NetworkingEngine: { registerScheme: () => {}, RequestType: { MANIFEST: 0, SEGMENT: 1 }, PluginPriority: { PREFERRED: 3 } } },
  }
  return { shaka, players, ShakaError }
})

vi.mock('shaka-player', () => ({ default: fake.shaka }))

const { RECOVERABLE, CRITICAL } = fake.ShakaError.Severity

const failure = (severity: number, cause: Error) => Object.assign(new Event('error'), {
  detail: new fake.ShakaError(severity, fake.ShakaError.Category.NETWORK, fake.ShakaError.Code.HTTP_ERROR, 'sabr://video', cause),
})

const start = async () => {
  const api = {
    openPlayback: vi.fn(async () => ({ id: 'playback:1', isLive: false, manifest: '<MPD/>', videoFormats: [], audioFormats: [], storyboards: [], captionTracks: [] })),
    closePlayback: vi.fn(async () => {}),
  }
  const video = Object.assign(new EventTarget(), {
    getBoundingClientRect: () => ({ height: 720 }),
    play: async () => {},
    currentTime: 0,
    muted: false,
  })
  const onError = vi.fn()
  await startShakaPlayback({
    api: api as unknown as FrameApi,
    video: video as unknown as HTMLVideoElement,
    videoId: 'video-1',
    startTime: 0,
    signal: new AbortController().signal,
    onError,
  })
  return { api, onError, player: fake.players.at(-1)! }
}

describe('a Shaka player whose stream the frame refused', () => {
  beforeEach(() => {
    vi.stubGlobal('devicePixelRatio', 1)
    vi.stubGlobal('document', { documentElement: { dataset: {} }, visibilityState: 'visible' })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // Shaka takes the refusal for one variant's failure and moves to the next, which the frame refuses at once too
  it('ends on the first recoverable refusal and reports it once, for the shorts player and the hover preview as well', async () => {
    const { api, onError, player } = await start()
    const refusal = new Error(`${STREAM_REFUSED} (SABR stream status 2 after 3 attempts)`)
    player.dispatchEvent(failure(RECOVERABLE, refusal))
    expect(onError).toHaveBeenCalledExactlyOnceWith(refusal)
    await vi.waitFor(() => expect(api.closePlayback).toHaveBeenCalledWith('playback:1'))
    expect(player.destroyed).toBe(true)
    player.dispatchEvent(failure(RECOVERABLE, refusal))
    expect(onError).toHaveBeenCalledOnce()
  })

  it('leaves any other recoverable error to Shaka\'s own retries, and reports a critical one without ending', async () => {
    const { api, onError, player } = await start()
    player.dispatchEvent(failure(RECOVERABLE, new Error('youtube: SABR stream status 2 after 3 attempts')))
    expect(onError).not.toHaveBeenCalled()
    const critical = new Error('youtube: segment returned 500')
    player.dispatchEvent(failure(CRITICAL, critical))
    expect(onError).toHaveBeenCalledExactlyOnceWith(critical)
    expect(player.destroyed).toBe(false)
    expect(api.closePlayback).not.toHaveBeenCalled()
  })
})
