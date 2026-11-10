import type { DirectRequest, DirectResponse } from '../frame/protocol'

import { directMethod } from '../frame/protocol'

/**
 * The one shape a direct call leaves in: a CORS simple request (a GET, or a POST with a text/plain body, and no other
 * request header) with no credentials, so the browser's own Google cookies never travel. Simple is required: Firefox
 * refuses youtubei.js's preflighted shape from youtube.fkn.app (measured 2026-11-02, Firefox 151, 4 of 4 contexts),
 * and InnerTube answers X-Origin from this origin with 400 "Origin doesn't match Host for XD3".
 */
export const simpleRequest = (method: 'GET' | 'POST', body: string | undefined, signal?: AbortSignal): RequestInit => ({
  method,
  ...(method === 'POST' && { headers: { 'content-type': 'text/plain;charset=UTF-8' }, body: body ?? '' }),
  credentials: 'omit',
  mode: 'cors',
  redirect: 'follow',
  signal,
})

const publish = (value: string) => {
  document.documentElement.dataset.ytDirect = value
}

/** Marks the lane off on the app's `<html>`, for an engine started with `yt-client:step:direct` off. */
export const reportDirectOff = () => publish('off')

/**
 * The app realm's end of the frame's direct lane (`FRAME_DIRECT_CONNECT`): sends each request the frame hands it as a
 * `simpleRequest` from this document, with the method `directMethod` gives its url, answers with YouTube's status,
 * readable headers and whole body, and publishes the lane's reports as `data-yt-direct`. Refuses any other url.
 * `close` drops the lane with its engine.
 */
export const openDirectLane = (send: typeof fetch = (input, init) => fetch(input, init)) => {
  const channel = new MessageChannel()
  const port = channel.port1
  const aborts = new Map<number, AbortController>()

  const answer = async ({ id, url, body }: Extract<DirectRequest, { type: 'fetch' }>) => {
    const abort = new AbortController()
    aborts.set(id, abort)
    try {
      const method = directMethod(url)
      if (!method) throw new Error(`yt-client: the direct lane carries only InnerTube and captions, not ${url}`)
      const response = await send(url, simpleRequest(method, body, abort.signal))
      const bytes = await response.arrayBuffer()
      port.postMessage({
        id,
        response: { status: response.status, statusText: response.statusText, headers: [...response.headers.entries()], body: bytes },
      } satisfies DirectResponse, [bytes])
    } catch (error) {
      if (abort.signal.aborted) return
      port.postMessage({
        id,
        error: error instanceof Error ? error.message : String(error),
        network: error instanceof TypeError,
      } satisfies DirectResponse)
    } finally {
      aborts.delete(id)
    }
  }

  port.addEventListener('message', (event) => {
    const message = event.data as DirectRequest
    if (message.type === 'report') publish(message.value)
    else if (message.type === 'cancel') aborts.get(message.id)?.abort()
    else void answer(message)
  })
  port.start()

  return {
    port: channel.port2,
    close: () => {
      port.close()
      for (const abort of aborts.values()) abort.abort()
      aborts.clear()
    },
  }
}
