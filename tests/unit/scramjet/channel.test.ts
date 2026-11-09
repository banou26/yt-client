import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import type { TransportRequest } from '../../../src/scramjet/protocol'

import { actAsChannel, CHANNEL_KEY, forgetChannel, readChannel, storeChannel } from '../../../src/scramjet/channel'
import { accountsListAnswer, BRAND_PAGE_ID, OTHER_PAGE_ID, twoChannels } from '../fixtures/accounts-list'

const ACCOUNTS_LIST = 'https://www.youtube.com/youtubei/v1/account/accounts_list?prettyPrint=false&alt=json'
const BROWSE = 'https://www.youtube.com/youtubei/v1/browse?prettyPrint=false&alt=json'
const PING = 'https://s.youtube.com/api/stats/playback?ns=yt&docid=dQw4w9WgXcQ&ver=2&cpn=abcdefghijklmnop'
const LOGGED_OUT = accountsListAnswer([], { loggedOut: true })

// the headers Scramjet hands the transport: youtubei.js's signed-in ones, and the jar it adds as `cookie`
const JAR = 'PREF=f6=40000000; SAPISID=sapisid/x; __Secure-3PAPISID=sapisid/x'
const SIGNED_IN = { authorization: 'SAPISIDHASH 1762700000_0123456789abcdef', 'x-goog-authuser': '0', 'content-type': 'application/json', cookie: JAR }
const SIGNED_OUT = { 'content-type': 'application/json', cookie: 'PREF=f6=40000000; VISITOR_INFO1_LIVE=visitor' }

const stubStorage = () => {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  })
  return store
}

// the egress: each call recorded, answered from `answers` in turn and the last one from then on
const egress = (...answers: unknown[]) => {
  const sent: { url: string, options: TransportRequest }[] = []
  const egressFetch = vi.fn(async (url: string, options: TransportRequest) => {
    sent.push({ url, options })
    const answer = answers.length > 1 ? answers.shift() : answers[0]
    return { status: 200, statusText: 'OK', headers: [['content-type', 'application/json']] as [string, string][], body: new Response(JSON.stringify(answer ?? {})).body }
  })
  return { sent, egressFetch, pageIds: () => sent.map(({ options }) => options.headers?.['x-goog-pageid']) }
}

const post = (headers: Record<string, string>): TransportRequest => ({ method: 'POST', headers, body: new TextEncoder().encode('{"context":{}}').buffer as ArrayBuffer, redirect: 'manual' })

describe('the stored channel', () => {
  let store: Map<string, string>

  beforeEach(() => {
    store = stubStorage()
  })

  afterEach(() => vi.unstubAllGlobals())

  it("reads back the page ID it stored, and nothing once the account's own channel is picked", () => {
    storeChannel(BRAND_PAGE_ID)
    expect(store.get(CHANNEL_KEY)).toBe(BRAND_PAGE_ID)
    expect(readChannel()).toBe(BRAND_PAGE_ID)
    storeChannel()
    expect(store.has(CHANNEL_KEY)).toBe(false)
    expect(readChannel()).toBeUndefined()
  })

  it('reads a value that is not all digits as no channel', () => {
    for (const value of ['', 'abc', `${BRAND_PAGE_ID}\r\nx-other: 1`, ' 1']) {
      store.set(CHANNEL_KEY, value)
      expect(readChannel()).toBeUndefined()
    }
  })

  it('is forgotten only while it is still the one named, so a pick made since in another tab stays', () => {
    storeChannel(OTHER_PAGE_ID)
    forgetChannel(BRAND_PAGE_ID)
    expect(readChannel()).toBe(OTHER_PAGE_ID)
    forgetChannel(OTHER_PAGE_ID)
    expect(readChannel()).toBeUndefined()
  })

  it('reads as no channel without storage, and writing it throws nothing', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('SecurityError') },
      setItem: () => { throw new Error('SecurityError') },
      removeItem: () => { throw new Error('SecurityError') },
    })
    expect(readChannel()).toBeUndefined()
    expect(() => storeChannel(BRAND_PAGE_ID)).not.toThrow()
    expect(() => storeChannel()).not.toThrow()
    expect(() => forgetChannel(BRAND_PAGE_ID)).not.toThrow()
  })
})

describe('the egress, as a brand channel', () => {
  let store: Map<string, string>

  beforeEach(() => {
    store = stubStorage()
  })

  afterEach(() => vi.unstubAllGlobals())

  const listAccounts = (fetch: ReturnType<typeof actAsChannel>) => fetch(ACCOUNTS_LIST, post(SIGNED_IN), undefined)

  it('sends X-Goog-PageId on every signed-in InnerTube call, keeping its other headers, and on no other call', async () => {
    const { sent, egressFetch } = egress({})
    const fetch = actAsChannel(egressFetch, BRAND_PAGE_ID)
    const calls: [string, TransportRequest][] = [
      [BROWSE, post(SIGNED_IN)],
      [BROWSE, post(SIGNED_OUT)],
      ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', { method: 'GET', headers: { cookie: JAR } }],
      ['https://www.youtube.com/api/timedtext?v=dQw4w9WgXcQ&lang=en', { method: 'GET', headers: { cookie: JAR } }],
      ['https://www.youtube.com.example/youtubei/v1/browse', post(SIGNED_IN)],
      ['https://youtubei.googleapis.com/youtubei/v1/browse', post(SIGNED_IN)],
    ]
    for (const [url, options] of calls) await fetch(url, options, undefined)
    expect(sent.map(({ url }) => url)).toEqual(calls.map(([url]) => url))
    expect(sent.map(({ options }) => options.headers)).toEqual([
      { ...SIGNED_IN, 'x-goog-pageid': BRAND_PAGE_ID },
      ...calls.slice(1).map(([, options]) => options.headers),
    ])
    expect(sent[0]!.options).toMatchObject({ method: 'POST', body: calls[0]![1].body, redirect: 'manual' })
  })

  it('sends the signed-in playback registration to www.youtube.com with X-Goog-PageId, as youtubei.js does, and a signed-out one as it came', async () => {
    const { sent, egressFetch } = egress({})
    const fetch = actAsChannel(egressFetch, BRAND_PAGE_ID)
    await fetch(PING, { method: 'POST', headers: { cookie: JAR } }, undefined)
    await fetch(PING, { method: 'POST', headers: { cookie: SIGNED_OUT.cookie } }, undefined)
    const registration = new URL(sent[0]!.url)
    expect(registration.origin + registration.pathname).toBe('https://www.youtube.com/api/stats/playback')
    expect(registration.search).toBe(new URL(PING).search)
    expect(sent[0]!.options).toEqual({ method: 'POST', headers: { cookie: JAR, 'x-goog-pageid': BRAND_PAGE_ID } })
    expect(sent[1]).toEqual({ url: PING, options: { method: 'POST', headers: { cookie: SIGNED_OUT.cookie } } })
  })

  it('reads a loggedOut answer to a channel as an id of another login: drops the channel and asks once more without it', async () => {
    store.set(CHANNEL_KEY, BRAND_PAGE_ID)
    const own = accountsListAnswer([{ name: 'Viewer', handle: '@viewer', selected: true }])
    const { pageIds, egressFetch } = egress(LOGGED_OUT, own)
    const fetch = actAsChannel(egressFetch, BRAND_PAGE_ID)
    expect(await new Response((await listAccounts(fetch)).body).json()).toEqual(own)
    expect(store.has(CHANNEL_KEY)).toBe(false)
    await fetch(BROWSE, post(SIGNED_IN), undefined)
    expect(pageIds()).toEqual([BRAND_PAGE_ID, undefined, undefined])
  })

  it('hands on the second loggedOut answer, which says the session ended, with no channel kept', async () => {
    store.set(CHANNEL_KEY, BRAND_PAGE_ID)
    const { pageIds, egressFetch } = egress(LOGGED_OUT)
    const fetch = actAsChannel(egressFetch, BRAND_PAGE_ID)
    expect(await new Response((await listAccounts(fetch)).body).json()).toEqual(LOGGED_OUT)
    expect(pageIds()).toEqual([BRAND_PAGE_ID, undefined])
    expect(store.has(CHANNEL_KEY)).toBe(false)
  })

  it("drops a channel the answer does not select, which YouTube answers as the account's own", async () => {
    store.set(CHANNEL_KEY, BRAND_PAGE_ID)
    const answer = accountsListAnswer(twoChannels('own'))
    const { pageIds, egressFetch } = egress(answer)
    const fetch = actAsChannel(egressFetch, BRAND_PAGE_ID)
    expect(await new Response((await listAccounts(fetch)).body).json()).toEqual(answer)
    await fetch(BROWSE, post(SIGNED_IN), undefined)
    expect(store.has(CHANNEL_KEY)).toBe(false)
    expect(pageIds()).toEqual([BRAND_PAGE_ID, undefined])
  })

  it('keeps the channel the answer selects, and keeps it through an error and an answer that lists no row', async () => {
    store.set(CHANNEL_KEY, BRAND_PAGE_ID)
    const { pageIds, egressFetch } = egress(accountsListAnswer(twoChannels('brand')), { error: { code: 500 } }, accountsListAnswer([]))
    const fetch = actAsChannel(egressFetch, BRAND_PAGE_ID)
    await listAccounts(fetch)
    await listAccounts(fetch)
    await listAccounts(fetch)
    await fetch(BROWSE, post(SIGNED_IN), undefined)
    expect(store.get(CHANNEL_KEY)).toBe(BRAND_PAGE_ID)
    expect(pageIds()).toEqual([BRAND_PAGE_ID, BRAND_PAGE_ID, BRAND_PAGE_ID, BRAND_PAGE_ID])
  })

  it('leaves a channel picked since in another tab stored when it drops its own', async () => {
    store.set(CHANNEL_KEY, OTHER_PAGE_ID)
    const { egressFetch } = egress(accountsListAnswer(twoChannels('own')))
    await listAccounts(actAsChannel(egressFetch, BRAND_PAGE_ID))
    expect(store.get(CHANNEL_KEY)).toBe(OTHER_PAGE_ID)
  })

  it('reads no signed-out accounts_list answer, and keeps the channel through it', async () => {
    store.set(CHANNEL_KEY, BRAND_PAGE_ID)
    const { sent, egressFetch } = egress(LOGGED_OUT)
    await actAsChannel(egressFetch, BRAND_PAGE_ID)(ACCOUNTS_LIST, post(SIGNED_OUT), undefined)
    expect(sent).toHaveLength(1)
    expect(sent[0]!.options.headers).toEqual(SIGNED_OUT)
    expect(store.get(CHANNEL_KEY)).toBe(BRAND_PAGE_ID)
  })
})
