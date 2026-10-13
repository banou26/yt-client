import type { BrowserSession, ImportedHistory } from '../../../src/history/browser-history'

import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import {
  canImportBrowserHistory,
  dayHeading,
  dayOf,
  importBrowserHistory,
  importFailure,
  keptBrowserHistory,
  readBrowserHistory,
  SignedOutError,
} from '../../../src/history/browser-history'
import { WEB_CLIENT_VERSION } from '../../../src/sources/youtube/client-version'
import fixture from './fehistory.json'

const store = vi.hoisted(() => ({ saved: [] as unknown[], deleted: 0 }))

vi.mock('../../../src/history/store', () => ({
  saveImportedHistory: async (history: unknown) => {
    store.saved.push(history)
  },
  deleteImportedHistory: async () => {
    store.deleted++
  },
}))

beforeEach(() => {
  store.saved = []
  store.deleted = 0
})

/* fehistory.json is one FEhistory answer InnerTube sent on 2026-10-13, reduced to its two public test videos, plus a
   second page cloned from it to exercise the continuation */

const NOW = new Date(2026, 9, 13, 12)

type Call = { url: string, init: RequestInit }

const SIGNED_IN: Record<string, string> = { LOGIN_INFO: 'login-value', SAPISID: 'sapisid-value', '__Secure-3PAPISID': 'sapisid-value' }

const fakeSession = ({
  allow = true,
  cookies = SIGNED_IN,
  first = fixture.first as unknown,
  next = fixture.next as unknown,
  status = 200,
} = {}) => {
  const asked: { hosts: string[], reason: string }[] = []
  const read: string[] = []
  const calls: Call[] = []
  const session: BrowserSession = {
    requestNetwork: async (hosts, reason) => {
      asked.push({ hosts, reason })
      return [{ allow }]
    },
    cookie: async ({ url, name }) => {
      read.push(`${url} ${name}`)
      return cookies[name] === undefined ? null : { name, value: cookies[name] }
    },
    fetch: async (url, init) => {
      calls.push({ url, init })
      const body = JSON.parse(init.body as string) as { browseId?: string, continuation?: string }
      const answer = body.browseId === 'FEhistory' ? first : body.continuation === 'fixture-continuation' ? next : undefined
      return answer === undefined || status !== 200
        ? new Response('{}', { status: answer === undefined ? 400 : status })
        : new Response(JSON.stringify(answer), { headers: { 'content-type': 'application/json' } })
    },
  }
  return { session, asked, read, calls }
}

const sidHash = (time: string, sapisid: string) =>
  createHash('sha1').update(`${time} ${sapisid} https://www.youtube.com`).digest('hex')

const sessionDigest = (sapisid: string) => createHash('sha256').update(`yt-client history ${sapisid}`).digest('hex')

const withHeading = (title: unknown) => JSON.parse(JSON.stringify(fixture.first).replace(
  '"itemSectionHeaderRenderer":{"title":{"runs":[{"text":"Yesterday"}]}}',
  JSON.stringify({ itemSectionHeaderRenderer: { title } }).slice(1, -1),
)) as unknown

describe('reading the history of the YouTube account signed in on this browser', () => {
  it('asks for the Network row on www.youtube.com with a reason, and reads nothing once it is declined', async () => {
    const { session, asked, read, calls } = fakeSession({ allow: false })
    await expect(readBrowserHistory(session, { now: NOW })).rejects.toThrow('Allow YouTube access to import your history')
    expect(asked).toHaveLength(1)
    expect(asked[0]?.hosts).toEqual(['www.youtube.com'])
    expect(asked[0]?.reason.length).toBeGreaterThan(0)
    expect(asked[0]?.reason.length).toBeLessThanOrEqual(100)
    expect(read).toEqual([])
    expect(calls).toEqual([])
  })

  it('counts a browser as signed in only with LOGIN_INFO and a SAPISID cookie, before any request', async () => {
    for (const cookies of [{ SAPISID: 'sapisid-value' }, { LOGIN_INFO: 'login' }] as Record<string, string>[]) {
      const { session, calls } = fakeSession({ cookies })
      await expect(readBrowserHistory(session, { now: NOW })).rejects.toThrow('This browser is not signed in to YouTube')
      expect(calls).toEqual([])
    }
  })

  it('reads every page through the browser session and keeps each video once, under its day', async () => {
    const { session } = fakeSession()
    const counts: number[] = []
    const { entries } = await readBrowserHistory(session, { now: NOW, onProgress: (count) => counts.push(count) })
    expect(entries.map((entry) => [entry.id, entry.watchedOn])).toEqual([
      ['C0DPdy98e4c', '2026-10-12'],
      ['jNQXAC9IVRw', '2026-10-12'],
      ['dQw4w9WgXcQ', '2026-10-03'],
    ])
    expect(entries[0]).toMatchObject({
      title: 'TEST VIDEO',
      durationSeconds: 18,
      progressPercent: 10,
      channel: { id: 'UCHDm-DKoMyJxKVgwGmuTaQA', name: 'Simon Yapp' },
    })
    expect(entries[0]?.thumbnail).toContain('i.ytimg.com/vi/C0DPdy98e4c/')
    expect(entries[2]).toMatchObject({ progressPercent: 48, durationSeconds: 214 })
    expect(counts).toEqual([2, 3])
  })

  it('sends each request with the browser cookies and a SAPISIDHASH of the browser SAPISID, never a cookie of its own', async () => {
    const { session, calls } = fakeSession()
    await readBrowserHistory(session, { now: NOW })
    expect(calls).toHaveLength(2)
    for (const { url, init } of calls) {
      expect(new URL(url).origin + new URL(url).pathname).toBe('https://www.youtube.com/youtubei/v1/browse')
      expect(init.credentials).toBe('include')
      const headers = new Headers(init.headers)
      expect(headers.has('cookie')).toBe(false)
      expect(headers.get('origin')).toBe('https://www.youtube.com')
      expect(headers.get('referer')).toBe('https://www.youtube.com/')
      expect(headers.get('x-goog-authuser')).toBe('0')
      expect(headers.get('x-youtube-client-version')).toBe(WEB_CLIENT_VERSION)
      const [, time, hash] = headers.get('authorization')?.match(/^SAPISIDHASH (\d+)_([0-9a-f]{40})$/) ?? []
      expect(hash).toBe(sidHash(time ?? '', 'sapisid-value'))
    }
    expect(calls.map(({ init }) => (JSON.parse(init.body as string) as { browseId?: string }).browseId)).toEqual(['FEhistory', undefined])
  })

  it('hashes __Secure-3PAPISID when the jar has no SAPISID, as youtube.com does', async () => {
    const { session, calls } = fakeSession({ cookies: { LOGIN_INFO: 'login', '__Secure-3PAPISID': 'secure-value' } })
    await readBrowserHistory(session, { now: NOW })
    const [, time, hash] = new Headers(calls[0]?.init.headers).get('authorization')?.match(/^SAPISIDHASH (\d+)_(\w+)$/) ?? []
    expect(hash).toBe(sidHash(time ?? '', 'secure-value'))
  })

  it('reads an answer InnerTube marks loggedOut as not signed in, never as an empty history', async () => {
    const first = { ...fixture.first, responseContext: { mainAppWebResponseContext: { loggedOut: true } } }
    const { session, calls } = fakeSession({ first })
    await expect(readBrowserHistory(session, { now: NOW })).rejects.toThrow('This browser is not signed in to YouTube')
    expect(calls).toHaveLength(1)
  })

  it('keeps a heading it cannot read as a day as text, and an empty one not at all', async () => {
    const unread = await readBrowserHistory(fakeSession({ first: withHeading({ runs: [{ text: 'Last week' }] }) }).session, { now: NOW })
    expect(unread.entries[0]).toMatchObject({ id: 'C0DPdy98e4c', heading: 'Last week' })
    expect(unread.entries[0]).not.toHaveProperty('watchedOn')
    const empty = await readBrowserHistory(fakeSession({ first: withHeading({}) }).session, { now: NOW })
    expect(empty.entries[0]?.id).toBe('C0DPdy98e4c')
    expect(empty.entries[0]).not.toHaveProperty('heading')
    expect(empty.entries[0]).not.toHaveProperty('watchedOn')
  })

  it('stops after 500 pages of a history that never ends', async () => {
    const endless = structuredClone(fixture.next)
    endless.onResponseReceivedActions[0]!.appendContinuationItemsAction.continuationItems.push(
      fixture.first.contents.twoColumnBrowseResultsRenderer.tabs[0]!.tabRenderer.content.sectionListRenderer.contents[1] as never,
    )
    const { session, calls } = fakeSession({ next: endless })
    const { entries } = await readBrowserHistory(session, { now: NOW })
    expect(calls).toHaveLength(500)
    expect(entries).toHaveLength(3)
  })
})

describe('the kept copy', () => {
  it('replaces the kept copy with what it read, naming the session by a digest and never by its cookies', async () => {
    const history = await importBrowserHistory(fakeSession().session)
    expect(store.saved).toEqual([history])
    expect(history.session).toBe(sessionDigest('sapisid-value'))
    expect(history.entries).toHaveLength(3)
    expect(JSON.stringify(history)).not.toMatch(/sapisid-value|login-value/)
  })

  it('deletes the kept copy when the browser is signed out of YouTube, and keeps nothing', async () => {
    await expect(importBrowserHistory(fakeSession({ cookies: {} }).session)).rejects.toBeInstanceOf(SignedOutError)
    expect(store.deleted).toBe(1)
    expect(store.saved).toEqual([])
  })

  it('leaves the kept copy when an import fails for another reason', async () => {
    await expect(importBrowserHistory(fakeSession({ allow: false }).session)).rejects.toThrow('Allow YouTube access')
    await expect(importBrowserHistory(fakeSession({ status: 401 }).session)).rejects.toThrow()
    expect(store.deleted).toBe(0)
    expect(store.saved).toEqual([])
  })

  const kept: ImportedHistory = { importedAt: 0, session: sessionDigest('sapisid-value'), entries: [{ id: 'C0DPdy98e4c', title: 'TEST VIDEO' }] }

  it('is shown while the browser is signed in to the session it came from, with no request to YouTube', async () => {
    const { session, asked, calls } = fakeSession()
    await expect(keptBrowserHistory(session, kept)).resolves.toBe(kept)
    expect(store.deleted).toBe(0)
    expect(calls).toEqual([])
    expect(asked[0]?.hosts).toEqual(['www.youtube.com'])
    expect(asked[0]?.reason.length).toBeLessThanOrEqual(100)
  })

  it('is deleted once the browser is on another YouTube session, or on none', async () => {
    for (const cookies of [{ ...SIGNED_IN, SAPISID: 'other-sapisid', '__Secure-3PAPISID': 'other-sapisid' }, { SAPISID: 'sapisid-value' }, {}] as Record<string, string>[]) {
      store.deleted = 0
      await expect(keptBrowserHistory(fakeSession({ cookies }).session, kept)).resolves.toBeUndefined()
      expect(store.deleted).toBe(1)
    }
  })

  it('is neither shown nor deleted when the session cannot be read', async () => {
    await expect(keptBrowserHistory(fakeSession({ allow: false }).session, kept)).rejects.toThrow()
    expect(store.deleted).toBe(0)
  })
})

describe('what the History page says when an import fails', () => {
  it('shows its own sentences as they are, and one plain line for anything else', async () => {
    expect(importFailure(new SignedOutError())).toBe('This browser is not signed in to YouTube')
    expect(importFailure(Object.assign(new Error('abi 3 < 5'), { name: 'ExtensionOutdatedError' }))).toBe('Update the FKN extension to import your history')
    const refused = await readBrowserHistory(fakeSession({ status: 401 }).session, { now: NOW }).catch((error: unknown) => error)
    expect(String(refused)).toContain('401')
    expect(importFailure(refused)).toBe('Could not import your history, try again')
  })
})

describe('the day YouTube lists a video under', () => {
  it('reads the headings of the History page as local days', () => {
    expect(dayOf('Today', NOW)).toBe('2026-10-13')
    expect(dayOf('Yesterday', NOW)).toBe('2026-10-12')
    // 2026-10-13 is a Tuesday
    expect(dayOf('Sunday', NOW)).toBe('2026-10-11')
    expect(dayOf('Wednesday', NOW)).toBe('2026-10-07')
    expect(dayOf('Tuesday', NOW)).toBe('2026-10-06')
    expect(dayOf('Oct 3', NOW)).toBe('2026-10-03')
    expect(dayOf('Dec 30', NOW)).toBe('2025-12-30')
    expect(dayOf('September 28, 2024', NOW)).toBe('2024-09-28')
    expect(dayOf('Feb 30', NOW)).toBeUndefined()
    expect(dayOf('Last week', NOW)).toBeUndefined()
    expect(dayOf(undefined, NOW)).toBeUndefined()
  })

  it('names a kept day the way the History page does', () => {
    expect(dayHeading('2026-10-13', NOW)).toBe('Today')
    expect(dayHeading('2026-10-12', NOW)).toBe('Yesterday')
    expect(dayHeading('2026-10-08', NOW)).toBe('Thursday')
    expect(dayHeading('2026-10-03', NOW)).toBe('Oct 3')
    expect(dayHeading('2025-12-30', NOW)).toBe('Dec 30, 2025')
  })
})

describe('where the import is offered', () => {
  it('is Chromium only', () => {
    expect(canImportBrowserHistory({ userAgentData: { brands: [{ brand: 'Chromium' }, { brand: 'Google Chrome' }] } })).toBe(true)
    expect(canImportBrowserHistory({})).toBe(false)
    expect(canImportBrowserHistory({ userAgentData: { brands: [{ brand: 'Not.A/Brand' }] } })).toBe(false)
  })
})
