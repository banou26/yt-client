import type { TransportRequest, TransportResponse } from './protocol'

import { carriesAccount } from './relay-nonce'

/**
 * `localStorage['yt-client:channel']`, in the app's own storage: the page ID of the brand channel of the signed-in
 * Google account that the engine acts as. Absent for the account's own channel. Read only when all digits.
 */
export const CHANNEL_KEY = 'yt-client:channel'

const PAGE_ID = /^\d+$/

export const readChannel = () => {
  try {
    const pageId = localStorage.getItem(CHANNEL_KEY)
    return pageId && PAGE_ID.test(pageId) ? pageId : undefined
  } catch {
    return undefined
  }
}

/** The channel the next engine acts as: a brand channel's page ID, or none for the account's own channel. */
export const storeChannel = (pageId?: string) => {
  try {
    if (pageId) localStorage.setItem(CHANNEL_KEY, pageId)
    else localStorage.removeItem(CHANNEL_KEY)
  } catch {}
}

/** Removes the stored channel only while it is still `pageId`, so a pick made since in another tab stays. */
export const forgetChannel = (pageId: string) => {
  if (readChannel() === pageId) storeChannel()
}

export type EgressFetch = (url: string, options: TransportRequest, signal: AbortSignal | undefined) => Promise<TransportResponse>

const INNERTUBE = 'https://www.youtube.com/youtubei/'
const ACCOUNTS_LIST = 'https://www.youtube.com/youtubei/v1/account/accounts_list'
const PLAYBACK_STATS_PATH = '/api/stats/playback'
const STATS_HOSTS = new Set(['s.youtube.com', 'www.youtube.com'])
const LOGGED_OUT = /"loggedOut"\s*:\s*true/

// where a signed-in call goes as the channel, or undefined for a call the channel does not touch
const channelTarget = (url: string) => {
  if (url.startsWith(INNERTUBE)) return url
  try {
    const parsed = new URL(url)
    if (!STATS_HOSTS.has(parsed.hostname) || parsed.pathname !== PLAYBACK_STATS_PATH) return undefined
    parsed.hostname = 'www.youtube.com'
    return parsed.href
  } catch {
    return undefined
  }
}

type AccountRow = { isSelected?: boolean, serviceEndpoint?: { selectActiveIdentityEndpoint?: { supportedTokens?: { pageIdToken?: { pageId?: string } }[] } } }

const accountRows = (value: unknown): AccountRow[] => {
  if (Array.isArray(value)) return value.flatMap(accountRows)
  if (!value || typeof value !== 'object') return []
  return Object.entries(value).flatMap(([key, child]) => key === 'accountItem' ? [child as AccountRow] : accountRows(child))
}

// an unknown id is answered as the account's own channel with no error (measured 2026-11-06)
const selectsOther = (text: string, pageId: string) => {
  let rows: AccountRow[]
  try {
    rows = accountRows(JSON.parse(text))
  } catch {
    return false
  }
  return rows.length > 0 && !rows.some((row) => row.isSelected
    && row.serviceEndpoint?.selectActiveIdentityEndpoint?.supportedTokens?.some((token) => token.pageIdToken?.pageId === pageId))
}

/**
 * The egress of an engine that acts as the brand channel `pageId`. Every signed-in InnerTube call carries it as
 * X-Goog-PageId, the one header youtube.com's own client sends for it, and the signed-in playback registration goes to
 * www.youtube.com with it, as youtubei.js sends that one. Alone the header picks the channel of the InnerTube reads
 * measured (accounts_list and browse, 2026-11-06); that it does the same for writes is inferred from youtube.com
 * sending it on them too. A signed-out call, and every other call, goes out untouched.
 *
 * accounts_list keeps the channel honest: an answer that selects another row drops it, and a `loggedOut` answer to it,
 * which is how YouTube answers a page ID another Google login owns (measured 2026-11-06), drops it and asks once more
 * without it, so only that second answer can say the session ended.
 */
export const actAsChannel = (egressFetch: EgressFetch, pageId: string): EgressFetch => {
  let channel: string | undefined = pageId
  const drop = (sent: string) => {
    channel = undefined
    forgetChannel(sent)
  }
  return async (url, options, signal) => {
    const sent = channel
    const target = sent && carriesAccount(options.headers) ? channelTarget(url) : undefined
    if (!sent || !target) return egressFetch(url, options, signal)
    const asChannel = { ...options, headers: { ...options.headers, 'x-goog-pageid': sent } }
    if (!target.startsWith(ACCOUNTS_LIST)) return egressFetch(target, asChannel, signal)
    const answer = await egressFetch(target, asChannel, signal)
    const body = await new Response(answer.body).arrayBuffer()
    const text = new TextDecoder().decode(body)
    if (LOGGED_OUT.test(text)) {
      drop(sent)
      return egressFetch(url, options, signal)
    }
    if (selectsOther(text, sent)) drop(sent)
    return { ...answer, body: new Response(body).body }
  }
}
