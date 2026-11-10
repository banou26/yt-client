importScripts('/__yt_scramjet__/controller/controller.sw.js')

// the controller calls skipWaiting on install, but an open page's controllers stay registered with the worker they
// started on and never reach a new one, so every proxied request would wait out CONTROLLER_WAIT_MS: a new worker
// waits instead until no page uses the old one, which the next load reaches
self.skipWaiting = async () => {}

const PROXY_PREFIX = '/__yt_scramjet__/proxy/'
const CONTROLLER_WAIT_MS = 10_000
const CONTROLLER_POLL_MS = 25

// Firefox returns undefined for the FetchEvent request `body` getter, so a body-bearing request is pre-read and passed to route() as an ArrayBuffer
const BODYLESS_METHODS = new Set(['GET', 'HEAD'])

const routeWithBody = async (event) => {
  const request = event.request
  let body = null
  try {
    const buffer = await request.clone().arrayBuffer()
    if (buffer.byteLength) body = buffer
  } catch {}
  if (body === null) return $scramjetController.route(event)
  return $scramjetController.route({
    request: {
      url: request.url,
      referrer: request.referrer,
      destination: request.destination,
      mode: request.mode,
      method: request.method,
      body,
      cache: request.cache,
      headers: request.headers,
    },
    clientId: event.clientId,
    resultingClientId: event.resultingClientId,
  })
}

// Chrome stops this worker after 30 s with no event and starts it again for the next fetch with no controller registered:
// the pages register again only on the revive it posts 100 ms after it starts. A proxied request left to the network in
// that window reaches Pages, which answers a POST with an empty 405 and a GET with the app's HTML, so it waits instead.
const controllerRegistered = async (event) => {
  const deadline = Date.now() + CONTROLLER_WAIT_MS
  while (!$scramjetController.shouldRoute(event)) {
    if (Date.now() >= deadline) return false
    await new Promise((resolve) => setTimeout(resolve, CONTROLLER_POLL_MS))
  }
  return true
}

const respond = async (event) => {
  if (!await controllerRegistered(event)) {
    return new Response('yt-client: no Scramjet controller registered for this request', { status: 503 })
  }
  const request = event.request
  if (BODYLESS_METHODS.has(request.method) || request.body != null) return $scramjetController.route(event)
  return routeWithBody(event)
}

self.addEventListener('fetch', (event) => {
  if (!new URL(event.request.url).pathname.startsWith(PROXY_PREFIX)) return
  event.respondWith(respond(event))
})
