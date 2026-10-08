import { describe, expect, it } from 'vite-plus/test'

import type { TransportRequest } from '../../../src/scramjet/protocol'

import { createRelayFetch, RELAY_NONCE_HEADER } from '../../../src/scramjet/relay-nonce'

type Sent = { url: string, init: RequestInit }

// what the relay keys its cache on (`handler.rs` cache_key in horionsoftware/proxy): method, url, the sorted header set, the body
const signature = ({ url, init }: Sent) => JSON.stringify([
  init.method ?? 'GET',
  url,
  Object.entries((init.headers ?? {}) as Record<string, string>)
    .map(([name, value]) => [name.toLowerCase(), value])
    .sort(([a = ''], [b = '']) => a.localeCompare(b)),
  init.body ? [...new Uint8Array(init.body as ArrayBuffer)] : null,
])

const relay = () => {
  const sent: Sent[] = []
  const relayFetch = createRelayFetch(async (url, init) => {
    sent.push({ url, init })
    return new Response('{}', { status: 200 })
  })
  return { sent, relayFetch }
}

const nonceOf = ({ init }: Sent) => (init.headers as Record<string, string> | undefined)?.[RELAY_NONCE_HEADER]

const json = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).buffer as ArrayBuffer

const signedIn = { 'content-type': 'application/json', authorization: 'SAPISIDHASH 1759550000_0123456789abcdef', 'x-goog-authuser': '0' }

// youtubei.js's first-visit bootstrap (Session.js): a per-boot cookie and user agent the relay may never see, so two first visits can be byte-identical
const firstVisit = { 'user-agent': 'Mozilla/5.0', cookie: 'PREF=tz=Europe.Prague;VISITOR_INFO1_LIVE=abc;' }

const FRESH: [string, string, TransportRequest][] = [
  ['the session bootstrap', 'https://www.youtube.com/sw.js_data', { method: 'GET', headers: firstVisit }],
  ['the session config', 'https://www.youtube.com/youtubei/v1/config?prettyPrint=false', { method: 'POST', headers: { 'content-type': 'application/json' }, body: json({ context: {} }) }],
  ['the player read', 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false&alt=json', { method: 'POST', headers: { 'content-type': 'application/json' }, body: json({ videoId: 'FAlMdord_Fg' }) }],
  ['the watch page read', 'https://www.youtube.com/watch?v=FAlMdord_Fg', { method: 'GET', headers: {} }],
  ['a live chat poll', 'https://www.youtube.com/youtubei/v1/live_chat/get_live_chat?prettyPrint=false', { method: 'POST', headers: { 'content-type': 'application/json' }, body: json({ continuation: 'same' }) }],
  ['a live chat replay poll', 'https://www.youtube.com/youtubei/v1/live_chat/get_live_chat_replay', { method: 'POST', headers: {}, body: json({ continuation: 'same' }) }],
]

// the jar Scramjet sends with a signed-in page load, which carries no authorization header
const signedInJar = { cookie: 'PREF=tz=Europe.Prague; SAPISID=x/y; __Secure-3PAPISID=x/y' }

const SIGNED: [string, string, TransportRequest][] = [
  ['a signed player read', 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false&alt=json', { method: 'POST', headers: signedIn, body: json({ videoId: 'FAlMdord_Fg' }) }],
  ['a signed session config', 'https://www.youtube.com/youtubei/v1/config?prettyPrint=false', { method: 'POST', headers: { ...signedIn, cookie: signedInJar.cookie }, body: json({ context: {} }) }],
  ['a watch page read with the signed-in jar', 'https://www.youtube.com/watch?v=FAlMdord_Fg', { method: 'GET', headers: signedInJar }],
  ['a session bootstrap with the signed-in jar', 'https://www.youtube.com/sw.js_data', { method: 'GET', headers: { 'user-agent': 'Mozilla/5.0', Cookie: signedInJar.cookie } }],
  ['a write', 'https://www.youtube.com/youtubei/v1/like/like?prettyPrint=false', { method: 'POST', headers: signedIn, body: json({ target: { videoId: 'FAlMdord_Fg' } }) }],
  ['a signed-in read, as after a write', 'https://www.youtube.com/youtubei/v1/browse?prettyPrint=false', { method: 'POST', headers: signedIn, body: json({ browseId: 'FEsubscriptions' }) }],
]

const SHARED: [string, string, TransportRequest][] = [
  ['base.js', 'https://www.youtube.com/s/player/0123abcd/player_ias.vflset/en_US/base.js', { method: 'GET', headers: {} }],
  ['iframe_api', 'https://www.youtube.com/iframe_api', { method: 'GET', headers: {} }],
  ['timedtext', 'https://www.youtube.com/api/timedtext?v=FAlMdord_Fg&lang=en&fmt=json3', { method: 'GET', headers: {} }],
  ['a signed-out search', 'https://www.youtube.com/youtubei/v1/search?prettyPrint=false', { method: 'POST', headers: { 'content-type': 'application/json' }, body: json({ query: 'lofi' }) }],
  ['a signed-out guide', 'https://www.youtube.com/youtubei/v1/guide?prettyPrint=false', { method: 'POST', headers: { 'content-type': 'application/json' }, body: json({}) }],
  ['a playback registration, unique by its cpn', 'https://s.youtube.com/api/stats/playback?ver=2&cpn=abcdefghijklmnop', { method: 'POST', headers: {} }],
]

describe('relay nonces', () => {
  it.each(FRESH)('%s carries a nonce, and a new one each time', async (_, url, options) => {
    const { sent, relayFetch } = relay()
    await relayFetch(url, options)
    await relayFetch(url, options)
    const [first, second] = sent.map(nonceOf)
    expect(first).toMatch(/^[0-9a-f-]{36}$/)
    expect(second).toMatch(/^[0-9a-f-]{36}$/)
    expect(first).not.toBe(second)
  })

  it('two identical first-visit session requests reach the relay as two signatures', async () => {
    const { sent, relayFetch } = relay()
    const [, url, options] = FRESH[0]!
    await relayFetch(url, options)
    await relayFetch(url, options)
    expect(sent).toHaveLength(2)
    expect(signature(sent[0]!)).not.toBe(signature(sent[1]!))
  })

  it.each(SHARED)('%s carries none, so identical calls share one cached answer', async (_, url, options) => {
    const { sent, relayFetch } = relay()
    await relayFetch(url, options)
    await relayFetch(url, options)
    expect(sent.map(nonceOf)).toEqual([undefined, undefined])
    expect(signature(sent[0]!)).toBe(signature(sent[1]!))
  })

  it.each(SIGNED)('%s goes out exactly as it did before nonces', async (_, url, options) => {
    const { sent, relayFetch } = relay()
    await relayFetch(url, options)
    await relayFetch(url, options)
    for (const { init } of sent) {
      expect(init).toEqual({ method: options.method, headers: options.headers, body: options.body, credentials: 'omit', redirect: options.redirect })
    }
    expect(signature(sent[0]!)).toBe(signature(sent[1]!))
  })

  it("keeps the caller's own headers and never mutates them", async () => {
    const { sent, relayFetch } = relay()
    const headers = { ...firstVisit }
    await relayFetch('https://www.youtube.com/sw.js_data', { method: 'GET', headers })
    expect(headers).toEqual(firstVisit)
    expect(sent[0]!.init.headers).toMatchObject(firstVisit)
  })

  it('goes out uncredentialed with the caller method, body and redirect mode', async () => {
    const { sent, relayFetch } = relay()
    const body = json({ query: 'lofi' })
    const response = await relayFetch('https://www.youtube.com/youtubei/v1/search', { method: 'POST', headers: {}, body, redirect: 'manual' })
    expect(sent[0]!.init).toMatchObject({ method: 'POST', body, credentials: 'omit', redirect: 'manual' })
    expect(response.status).toBe(200)
  })
})
