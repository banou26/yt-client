import type { ProxyTransport } from '@mercuryworkshop/proxy-transports'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { Actions, HTTPClient } from 'youtubei.js/web'

import type { YoutubeClient } from '../../../src/sources/youtube'
import type { TransportRequest } from '../../../src/scramjet/protocol'

import { CHANNEL_KEY } from '../../../src/scramjet/channel'
import { BUILD_ID } from '../../../src/scramjet/engine-build'
import { HOST_BOOTSTRAP } from '../../../src/scramjet/protocol'
import { createYoutubeSource } from '../../../src/sources/youtube'
import { accountsListAnswer, BRAND_PAGE_ID, twoChannels } from '../fixtures/accounts-list'

// the host as it boots, up to the transport it gives Scramjet's Controller, which is what this reads
const scramjet = vi.hoisted(() => ({ transport: undefined as ProxyTransport | undefined }))
vi.mock('@mercuryworkshop/scramjet', () => ({ defaultConfigDev: {}, Tap: { tap: () => {} } }))
vi.mock('@mercuryworkshop/scramjet-controller', () => ({
  Controller: class {
    constructor({ transport }: { transport: ProxyTransport }) {
      scramjet.transport = transport
    }
    async wait() {}
    createFrame() {
      return { id: 1, hooks: { init: { post: {} } }, go: () => {} }
    }
  },
}))

// the relay end of the egress worker: what leaves the device, answered as YouTube answers the channel it names
const relay = vi.hoisted(() => ({ sent: [] as { url: string, options: TransportRequest }[] }))
vi.mock('osra', () => ({
  expose: async () => ({
    fknFetch: async (url: string, options: TransportRequest) => {
      relay.sent.push({ url, options })
      const asBrand = options.headers?.['x-goog-pageid'] === BRAND_PAGE_ID
      const body = url.includes('/account/accounts_list') ? JSON.stringify(accountsListAnswer(twoChannels(asBrand ? 'brand' : 'own'))) : '{}'
      return { status: 200, statusText: 'OK', headers: [['content-type', 'application/json']], body: new Response(body).body }
    },
  }),
}))

const ORIGIN = 'https://youtube.fkn.app'
const JAR = 'PREF=f6=40000000; SAPISID=sapisid/x; __Secure-3PAPISID=sapisid/x'
const SIGNED_OUT_JAR = 'PREF=f6=40000000; VISITOR_INFO1_LIVE=visitor'
const PING = 'https://s.youtube.com/api/stats/playback?ns=yt&docid=dQw4w9WgXcQ&ver=2&cpn=abcdefghijklmnop'

const open: MessagePort[] = []

type JarCookie = { name: string, domain: string, expires?: number }
const SESSION: JarCookie[] = [{ name: 'SAPISID', domain: '.youtube.com' }, { name: 'PREF', domain: '.youtube.com' }]

// scramjet-controller's IndexedDB as it persists the jar, served to the one read the host makes of it
const persistedJar = (cookies: JarCookie[]) => {
  const databases: Record<string, Record<string, Record<string, unknown>>> = {
    __scramjet_controller: { state: { cookies: { cookies: JSON.stringify(Object.fromEntries(cookies.map((cookie) => [`${cookie.domain}@/@${cookie.name}`, cookie]))) } } },
  }
  const answer = <T>(result: T) => {
    const request = { result, onsuccess: undefined as (() => void) | undefined, onerror: undefined as (() => void) | undefined, onupgradeneeded: undefined }
    setTimeout(() => request.onsuccess?.())
    return request
  }
  return {
    open: (name: string) => answer({
      close: () => {},
      transaction: (store: string) => ({ objectStore: () => ({ get: (key: string) => answer(databases[name]?.[store]?.[key]) }) }),
    }),
  }
}

const bootHost = async (stored: Record<string, string>, jar = SESSION) => {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored[key] ?? null,
    setItem: (key: string, value: string) => { stored[key] = value },
    removeItem: (key: string) => { delete stored[key] },
  })
  vi.stubGlobal('indexedDB', persistedJar(jar))
  const listeners = new Set<(event: MessageEvent) => void>()
  const parent = { postMessage: () => {} }
  vi.stubGlobal('window', {
    parent,
    addEventListener: (type: string, listener: (event: MessageEvent) => void) => { if (type === 'message') listeners.add(listener) },
    removeEventListener: (_type: string, listener: (event: MessageEvent) => void) => { listeners.delete(listener) },
  })
  vi.stubGlobal('location', { origin: ORIGIN })
  vi.stubGlobal('document', {
    documentElement: { dataset: {} },
    createElement: () => ({ setAttribute: () => {}, style: {} }),
    body: { appendChild: () => {} },
  })
  vi.stubGlobal('navigator', { serviceWorker: { register: async () => ({ active: {} }) } })
  vi.stubGlobal('fetch', async () => new Response('the frame bundle'))
  await import('../../../src/scramjet/host')
  const egress = new MessageChannel()
  const extension = new MessageChannel()
  open.push(egress.port1, egress.port2, extension.port1, extension.port2)
  // the app realm's extension fetch, with no extension: every call goes on to the relay
  extension.port1.addEventListener('message', (event) => {
    const request = event.data as { type: string, id: number }
    if (request.type === 'fetch') extension.port1.postMessage({ id: request.id, response: null })
  })
  extension.port1.start()
  for (const listener of listeners) {
    listener({ origin: ORIGIN, source: parent, data: { type: HOST_BOOTSTRAP, build: BUILD_ID }, ports: [egress.port2, extension.port2] } as unknown as MessageEvent)
  }
  await vi.waitFor(() => expect(scramjet.transport).toBeDefined())
  return scramjet.transport!
}

type Handed = { url: string, method: string, headers: Record<string, string>, body?: ArrayBuffer }

// Scramjet's service worker between the frame and the transport: the browser drops the Cookie header a page sets, and
// Scramjet adds its jar's
const throughScramjet = (transport: ProxyTransport, jar: string, handed: Handed[]) => async (input: RequestInfo | URL, init?: RequestInit) => {
  const request = new Request(input, init)
  const headers: [string, string][] = [...request.headers].filter(([name]) => name !== 'cookie')
  headers.push(['cookie', jar])
  const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.arrayBuffer()
  handed.push({ url: request.url, method: request.method, headers: Object.fromEntries(headers), body })
  const answer = await transport.request(new URL(request.url), request.method, body ?? null, headers, undefined)
  return new Response(answer.body as BodyInit, { status: answer.status, headers: answer.headers })
}

// the frame's catalog client as Innertube.create builds it: youtubei.js's own HTTPClient, signed in when it has the cookie
const catalogActions = (fetch: typeof globalThis.fetch, cookie?: string) => {
  const session = {
    api_version: 'v1',
    logged_in: cookie !== undefined,
    account_index: 0,
    oauth: {},
    context: { client: { clientName: 'WEB', clientVersion: '2.20261008.00.00', visitorData: 'visitor' }, user: {} },
  } as Record<string, unknown>
  session.http = new HTTPClient(session as never, cookie, fetch)
  return new Actions(session as never)
}

const readSession = (fetch: typeof globalThis.fetch, cookie?: string) => createYoutubeSource({
  fetch,
  createClient: async () => ({ actions: catalogActions(fetch, cookie) }) as unknown as YoutubeClient,
  signedIn: () => cookie !== undefined,
}).session()

describe("the engine host's transport", () => {
  beforeEach(() => {
    vi.resetModules()
    scramjet.transport = undefined
    relay.sent = []
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    for (const port of open.splice(0)) port.close()
  })

  it("sends a signed-in InnerTube call to the egress as the channel stored in the app's storage, which picks it", async () => {
    const transport = await bootHost({ [CHANNEL_KEY]: BRAND_PAGE_ID })
    const handed: Handed[] = []
    const session = await readSession(throughScramjet(transport, JAR, handed), JAR)
    expect(relay.sent).toHaveLength(1)
    const [list] = relay.sent
    expect(list!.url).toBe('https://www.youtube.com/youtubei/v1/account/accounts_list?prettyPrint=false&alt=json')
    expect(list!.options.headers).toMatchObject({ 'x-goog-authuser': '0', 'x-goog-pageid': BRAND_PAGE_ID, cookie: JAR })
    expect(list!.options.headers?.authorization).toMatch(/^SAPISIDHASH \d+_[0-9a-f]{40}$/)
    expect(session).toMatchObject({ handle: '@viewer-brand', accounts: [{ selected: undefined }, { brandPageId: BRAND_PAGE_ID, selected: true }] })
  })

  it('sends the signed-in playback registration of the frame to www.youtube.com as the stored channel', async () => {
    const transport = await bootHost({ [CHANNEL_KEY]: BRAND_PAGE_ID })
    await throughScramjet(transport, JAR, [])(PING, { method: 'POST' })
    const [registration] = relay.sent
    expect(registration!.url).toBe(PING.replace('https://s.youtube.com', 'https://www.youtube.com'))
    expect(registration!.options.headers).toMatchObject({ cookie: JAR, 'x-goog-pageid': BRAND_PAGE_ID })
  })

  const asHanded = (handed: Handed[]) => handed.map(({ url, method, headers, body }) => ({ url, options: { method, headers, body, redirect: 'manual' } }))

  it("sends a single-channel account's calls to the egress exactly as Scramjet hands them", async () => {
    const transport = await bootHost({})
    const handed: Handed[] = []
    const fetch = throughScramjet(transport, JAR, handed)
    const session = await readSession(fetch, JAR)
    await fetch(PING, { method: 'POST' })
    await fetch('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(relay.sent).toEqual(asHanded(handed))
    expect(relay.sent.flatMap(({ options }) => Object.keys(options.headers ?? {})).filter((name) => name.toLowerCase() === 'x-goog-pageid')).toEqual([])
    expect(session).toMatchObject({ handle: '@viewer', accounts: [{ selected: true }, { selected: undefined }] })
  })

  it('sends signed-out calls to the egress exactly as Scramjet hands them, with a channel still stored', async () => {
    // the jar held a session when the engine booted, and Google cleared it since
    const transport = await bootHost({ [CHANNEL_KEY]: BRAND_PAGE_ID })
    const handed: Handed[] = []
    const fetch = throughScramjet(transport, SIGNED_OUT_JAR, handed)
    await catalogActions(fetch).execute('/browse', { browseId: 'FEwhat_to_watch' })
    await fetch(PING, { method: 'POST' })
    await fetch('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(relay.sent).toHaveLength(3)
    expect(relay.sent).toEqual(asHanded(handed))
    expect(relay.sent[0]!.options.headers).not.toHaveProperty('authorization')
  })

  it('boots with no channel, and removes the stored one, when the jar no longer holds a session', async () => {
    const stored = { [CHANNEL_KEY]: BRAND_PAGE_ID }
    const transport = await bootHost(stored, [{ name: 'SAPISID', domain: '.youtube.com', expires: Date.now() - 1_000 }])
    expect(stored).toEqual({})
    const handed: Handed[] = []
    await readSession(throughScramjet(transport, JAR, handed), JAR)
    expect(relay.sent).toHaveLength(1)
    expect(relay.sent).toEqual(asHanded(handed))
  })
})
