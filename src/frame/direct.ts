import type { DirectReport, DirectRequest, DirectResponse } from './protocol'

import { FRAME_DIRECT_CONNECT, isDirectUrl } from './protocol'

/** How long direct calls pause after one failed with a TypeError and the frame's own fetch then answered it. */
export const DIRECT_SKIP_MS = 5 * 60_000

/** Sends an InnerTube POST from the app realm; rejects with a TypeError when the browser's fetch did. */
export type DirectFetch = (url: string, body: string, signal?: AbortSignal) => Promise<Response>

type FrameWindow = Window & {
  [FRAME_DIRECT_CONNECT]?: (port: MessagePort) => void
}

let lanePort: MessagePort | undefined
let lastReport: DirectReport | undefined
let requestId = 0
const pending = new Map<number, { resolve(response: Response): void, reject(error: unknown): void }>()

const NULL_BODY_STATUSES = [204, 205, 304]

const answer = (message: DirectResponse) => {
  const request = pending.get(message.id)
  if (!request) return
  pending.delete(message.id)
  if (message.error !== undefined) {
    request.reject(message.network ? new TypeError(message.error) : new Error(message.error))
    return
  }
  const { status, statusText, headers, body } = message.response
  try {
    request.resolve(new Response(NULL_BODY_STATUSES.includes(status) ? null : body, { status, statusText, headers }))
  } catch (error) {
    request.reject(error)
  }
}

if (typeof window !== 'undefined') {
  Object.defineProperty(window as FrameWindow, FRAME_DIRECT_CONNECT, {
    configurable: true,
    value: (port: MessagePort) => {
      port.addEventListener('message', (event) => answer(event.data as DirectResponse))
      port.start()
      lanePort = port
    },
  })
}

const sendDirect: DirectFetch = (url, body, signal) => new Promise((resolve, reject) => {
  const port = lanePort
  if (!port) {
    reject(new TypeError('yt-client: the direct lane is not connected'))
    return
  }
  if (signal?.aborted) {
    reject(signal.reason)
    return
  }
  const id = ++requestId
  pending.set(id, { resolve, reject })
  signal?.addEventListener('abort', () => {
    if (!pending.delete(id)) return
    port.postMessage({ type: 'cancel', id } satisfies DirectRequest)
    reject(signal.reason)
  }, { once: true })
  port.postMessage({ type: 'fetch', id, url, body } satisfies DirectRequest)
})

/** The app realm's direct lane, once the host connected it; undefined while `yt-client:step:direct` is off. */
export const directLane = (): DirectFetch | undefined => lanePort && sendDirect

/** Tells the app realm the lane's state, once per change. */
export const reportDirect = (value: DirectReport) => {
  if (value === lastReport || !lanePort) return
  lastReport = value
  lanePort.postMessage({ type: 'report', value } satisfies DirectRequest)
}

const requestParts = (input: RequestInfo | URL, init?: RequestInit) => {
  const request = typeof input === 'string' || 'href' in input ? undefined : input
  return {
    url: request ? request.url : typeof input === 'string' ? input : (input as URL).href,
    method: (init?.method ?? request?.method ?? 'GET').toUpperCase(),
    headers: new Headers(init?.headers ?? request?.headers),
    body: init?.body,
    signal: init?.signal ?? request?.signal ?? undefined,
  }
}

type YoutubeFetchOptions = {
  /** Today's path: the frame's own fetch, through Scramjet's service worker to the extension or the relay. */
  fetch: typeof fetch
  direct: () => DirectFetch | undefined
  signedIn: () => boolean
  report: (value: DirectReport) => void
  now?: () => number
}

/**
 * youtubei.js's fetch. A signed-out InnerTube POST goes on the direct lane when it is connected; every other request,
 * and every signed-in one, takes today's path unchanged.
 *
 * A direct answer is YouTube's own whatever its status, and is never sent again. Only a TypeError resends that one
 * request on today's path, and only when that path then answers it with a 2xx are direct calls paused, for
 * `DIRECT_SKIP_MS`: an outage fails both paths, so it must not turn the lane off. A resend repeats only reads, since
 * every write needs a session and a signed-in request never goes direct.
 */
export const createYoutubeFetch = ({ fetch, direct, signedIn, report, now = Date.now }: YoutubeFetchOptions) => {
  let skipUntil = 0
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const lane = direct()
    if (!lane) return fetch(input, init)
    const { url, method, headers, body, signal } = requestParts(input, init)
    if (method !== 'POST' || typeof body !== 'string' || !isDirectUrl(url)) return fetch(input, init)
    if (signedIn() || headers.has('authorization')) {
      report('off')
      return fetch(input, init)
    }
    if (now() < skipUntil) return fetch(input, init)
    try {
      const response = await lane(url, body, signal)
      report('on')
      return response
    } catch (error) {
      if (signal?.aborted || (error as { name?: unknown } | null)?.name !== 'TypeError') throw error
      const response = await fetch(input, init)
      if (response.ok) {
        skipUntil = now() + DIRECT_SKIP_MS
        report('skipped')
        console.warn('[yt-client] a direct YouTube request failed and the frame\'s own fetch answered it, so direct requests pause for 5 minutes:', String((error as Error).message))
      }
      return response
    }
  }
}
