import type { TransportRequest, TransportResponse } from './protocol'

/**
 * The request header that gives a relayed call an answer of its own.
 *
 * The FKN relay caches every request on its whole signature (method, url, every header, body), by
 * design, and is never told to skip anything. A call whose answer must be fresh therefore varies its
 * own request: a value nobody else sends is a cache key nobody else has. Only calls that reach the
 * relay carry it; the extension and the tunnel have no shared cache to vary.
 */
export const RELAY_NONCE_HEADER = 'x-fkn-nonce'

// the session bootstrap every boot sends, the playback reads whose streaming urls expire, and live chat polls that can repeat a continuation
// the bootstrap is measured (2026-10-04): it reaches the relay with no cookie and the browser's own user agent, so two fresh profiles on production got one cached `/sw.js_data` answer and one visitor id
const FRESH_PATHS = new Set([
  '/sw.js_data',
  '/youtubei/v1/config',
  '/youtubei/v1/player',
  '/watch',
  '/youtubei/v1/live_chat/get_live_chat',
  '/youtubei/v1/live_chat/get_live_chat_replay',
])

const YOUTUBE_HOST = /(^|\.)(youtube\.com|youtubei\.googleapis\.com)$/

// a signed-in call goes out exactly as it did before nonces: its cache key already carries the account's cookies, and a change to it can only be judged from a signed-in session
// the headers here are Scramjet's raw ones, so its jar arrives as `cookie`
const carriesAccount = (headers: Record<string, string> | undefined) =>
  !!headers && Object.entries(headers).some(([name, value]) => {
    const header = name.toLowerCase()
    return (header === 'authorization' && value !== '') || (header === 'cookie' && /(?:^|;\s*)SAPISID=/.test(value))
  })

/** Whether a call must get an answer of its own from the relay rather than one it already holds. A signed-in call never does. */
export const needsFreshAnswer = (url: string, options: TransportRequest) => {
  if (carriesAccount(options.headers)) return false
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  return YOUTUBE_HOST.test(parsed.hostname) && FRESH_PATHS.has(parsed.pathname)
}

/** The headers a relayed call goes out with: the caller's own, plus a new nonce when its answer must be fresh. */
export const withRelayNonce = (url: string, options: TransportRequest) =>
  needsFreshAnswer(url, options)
    ? { ...options.headers, [RELAY_NONCE_HEADER]: crypto.randomUUID() }
    : options.headers

/** The egress worker's relay call, over `@fkn/lib`'s `fetch`, which is passed in so the shape can be tested without a broker. */
export const createRelayFetch = (
  fetchWithFkn: (url: string, init: RequestInit) => Promise<Response>,
) => async (url: string, options: TransportRequest): Promise<TransportResponse> => {
  const response = await fetchWithFkn(url, {
    method: options.method,
    headers: withRelayNonce(url, options),
    body: options.body,
    credentials: 'omit',
    redirect: options.redirect,
  })
  return {
    status: response.status,
    statusText: response.statusText,
    headers: [...response.headers.entries()],
    body: response.body,
  }
}
