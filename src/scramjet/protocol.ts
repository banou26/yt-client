export type TransportResponse = {
  status: number
  statusText: string
  headers: [string, string][]
  body: ReadableStream<Uint8Array> | null
}

export type TransportRequest = {
  method?: string
  headers?: Record<string, string>
  body?: ArrayBuffer | null
  redirect?: 'follow' | 'manual'
}

export type EgressApi = {
  fknFetch(url: string, options: TransportRequest): Promise<TransportResponse>
  libcurlFetch(
    requestId: string,
    url: string,
    options: TransportRequest,
  ): Promise<TransportResponse>
  cancelLibcurlFetch(requestId: string): Promise<void>
  prewarm(host: string): Promise<void>
}

export const EGRESS_KEY = 'yt-client-egress'
export const ENGINE_READY = 'yt-client-engine-ready'

export const EGRESS_ABORT_ALL = 'yt-client-egress-abort-all'

/* HOST_BOOTSTRAP carries two ports: ports[0] the EgressApi straight to the egress worker, ports[1] the extension fetch back into the app realm.
   With yt-client:step:y1 on it carries a third, ports[2], the app realm's bridge to the BotGuard agent, which the host hands to the frame.
   With `direct` set (yt-client:step:direct) its LAST port is the app realm's direct lane (direct-lane.ts), which the host hands to the frame too.
   The host frame must not import `@fkn/lib` at all: importing it ANYWHERE injects an `fkn.app/api` broker iframe into that realm's document.
   Each side names its build (engine-build.ts), and a peer that names another one, or none, is refused before any port is used. */
export const HOST_HELLO = 'yt-client-host-hello'
export const HOST_BOOTSTRAP = 'yt-client-host-bootstrap'

export type HostHello = { type: typeof HOST_HELLO, build: string }
export type HostBootstrap = { type: typeof HOST_BOOTSTRAP, build: string, direct?: true }

export type ExtFetchRequest = {
  type: 'fetch'
  id: number
  url: string
  options: TransportRequest
} | {
  type: 'cancel'
  id: number
}

export type ExtFetchResponse = {
  id: number
  response: TransportResponse | null
  error?: never
} | {
  id: number
  response?: never
  error: string
}

export const CLEAR_COOKIES = 'clear-cookies'
export const COOKIES_CLEARED = 'cookies-cleared'

export type HostControlRequest = {
  type: typeof CLEAR_COOKIES
  id: number
}

export type HostControlEvent = {
  type: typeof COOKIES_CLEARED
  id: number
  error?: string
}

/* The sign-in window (`SIGNIN_WINDOW_PATH`) is a same-origin popup the app opens on the click. It says SIGNIN_HELLO to its
   opener, which answers SIGNIN_PORTS with ports[0], an EgressApi port to the opener's egress worker, so every hop of the
   sign-in leaves through the app's own libcurl over WebVPN, as it did inline. SIGNIN_DONE tells the opener the window's Scramjet jar holds
   the session and was persisted, which the engine's controller reads through IndexedDB `__scramjet_controller`. */
export const SIGNIN_WINDOW_PATH = '/__yt_scramjet__/signin.html'
export const SIGNIN_HELLO = 'yt-client-signin-hello'
export const SIGNIN_PORTS = 'yt-client-signin-ports'
export const SIGNIN_DONE = 'yt-client-signin-done'

// the window names its build as the engine host does (engine-build.ts): it loads from a fixed path, so a tab opened before a deploy gets the new one
export type SignInWindowMessage = { type: typeof SIGNIN_HELLO, build: string } | { type: typeof SIGNIN_DONE }
export type SignInPorts = { type: typeof SIGNIN_PORTS }

export type EgressRole = 'engine' | 'signin'
/** The sign-in window's libcurl request ids start with it, so an engine reset's abort leaves them alone. */
export const SIGNIN_REQUEST_PREFIX = 'signin:'
