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

const PLAIN_END = [{ style: 'VIDEO', videoId: 'video-2' }]
const CARD_END = [{ style: 'VIDEO', videoId: 'video-3' }, { style: 'CHANNEL', channelId: 'channel-1' }]

const start = async (session: { playerParams?: string, endScreen?: unknown[] } = {}, endScreen = async () => CARD_END) => {
  const api = {
    openPlayback: vi.fn(async () => ({
      id: 'playback:1', isLive: false, manifest: '<MPD/>', videoFormats: [], audioFormats: [], storyboards: [], captionTracks: [], endScreen: [],
      ...session,
    })),
    closePlayback: vi.fn(async () => {}),
    endScreen: vi.fn(endScreen),
  }
  const video = Object.assign(new EventTarget(), {
    getBoundingClientRect: () => ({ height: 720 }),
    play: async () => {},
    currentTime: 0,
    muted: false,
  })
  const onError = vi.fn()
  const onEndScreen = vi.fn()
  const controller = await startShakaPlayback({
    api: api as unknown as FrameApi,
    video: video as unknown as HTMLVideoElement,
    videoId: 'video-1',
    playerParams: session.playerParams ?? 'params-1',
    startTime: 0,
    signal: new AbortController().signal,
    onError,
    onEndScreen,
  })
  return { api, onError, onEndScreen, controller, player: fake.players.at(-1)! }
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

describe('the end screen a Shaka player shows', () => {
  beforeEach(() => {
    vi.stubGlobal('devicePixelRatio', 1)
    vi.stubGlobal('document', { documentElement: { dataset: {} }, visibilityState: 'visible' })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // the answer to a card's params leaves the end screen out
  it('comes from the plain watch page for a page read with a card\'s params', async () => {
    const { api, onEndScreen } = await start({ playerParams: 'params-1' })
    await vi.waitFor(() => expect(onEndScreen).toHaveBeenCalledExactlyOnceWith(CARD_END))
    expect(api.endScreen).toHaveBeenCalledExactlyOnceWith('video-1')
  })

  // as after params whose answer did not play, which the frame read again as the plain page
  it('is the session\'s own for a plain read, with nothing more asked', async () => {
    const { api, onEndScreen } = await start({ endScreen: PLAIN_END })
    expect(onEndScreen).toHaveBeenCalledExactlyOnceWith(PLAIN_END)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(api.endScreen).not.toHaveBeenCalled()
  })

  it('is dropped when the plain page answers after the player ended', async () => {
    let answer: (elements: typeof CARD_END) => void = () => {}
    const pending = new Promise<typeof CARD_END>((resolve) => { answer = resolve })
    const { api, onEndScreen, controller } = await start({ playerParams: 'params-1' }, () => pending)
    expect(api.endScreen).toHaveBeenCalledOnce()
    await controller.destroy()
    answer(CARD_END)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(onEndScreen).not.toHaveBeenCalled()
  })
})
