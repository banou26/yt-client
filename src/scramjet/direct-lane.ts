import type { DirectRequest, DirectResponse } from '../frame/protocol'

import { isDirectUrl } from '../frame/protocol'

/**
 * The one shape a direct InnerTube call leaves in: a CORS simple request (POST, a text/plain body, no other request
 * header) with no credentials, so the browser's own Google cookies never travel. Simple is required: Firefox refuses
 * youtubei.js's preflighted shape from youtube.fkn.app (measured 2026-11-02, Firefox 151, 4 of 4 contexts), and
 * InnerTube answers X-Origin from this origin with 400 "Origin doesn't match Host for XD3".
 */
export const simpleRequest = (body: string, signal?: AbortSignal): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'text/plain;charset=UTF-8' },
  body,
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
 * The app realm's end of the frame's direct lane (`FRAME_DIRECT_CONNECT`): sends each InnerTube POST the frame hands
 * it as a `simpleRequest` from this document, answers with YouTube's status, readable headers and whole body, and
 * publishes the lane's reports as `data-yt-direct`. Refuses any other url. `close` drops the lane with its engine.
 */
export const openDirectLane = (send: typeof fetch = (input, init) => fetch(input, init)) => {
  const channel = new MessageChannel()
  const port = channel.port1
  const aborts = new Map<number, AbortController>()

  const answer = async ({ id, url, body }: Extract<DirectRequest, { type: 'fetch' }>) => {
    const abort = new AbortController()
    aborts.set(id, abort)
    try {
      if (!isDirectUrl(url)) throw new Error(`yt-client: the direct lane carries only InnerTube, not ${url}`)
      const response = await send(url, simpleRequest(body, abort.signal))
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
