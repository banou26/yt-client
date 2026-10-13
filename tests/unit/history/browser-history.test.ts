import type { BrowserSession } from '../../../src/history/browser-history'

import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vite-plus/test'

import { canImportBrowserHistory, dayHeading, dayOf, readBrowserHistory } from '../../../src/history/browser-history'
import { WEB_CLIENT_VERSION } from '../../../src/sources/youtube/client-version'
import fixture from './fehistory.json'

/* fehistory.json is one FEhistory answer InnerTube sent on 2026-10-13, reduced to its two public test videos, plus a
   second page cloned from it to exercise the continuation */

const NOW = new Date(2026, 9, 13, 12)

type Call = { url: string, init: RequestInit }

const fakeSession = ({
  allow = true,
  cookies = { LOGIN_INFO: 'login', SAPISID: 'sapisid-value', '__Secure-3PAPISID': 'sapisid-value' } as Record<string, string>,
  first = fixture.first as unknown,
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
      const answer = body.browseId === 'FEhistory' ? first : body.continuation === 'fixture-continuation' ? fixture.next : undefined
      return answer === undefined
        ? new Response('{}', { status: 400 })
        : new Response(JSON.stringify(answer), { headers: { 'content-type': 'application/json' } })
    },
  }
  return { session, asked, read, calls }
}

const sidHash = (time: string, sapisid: string) =>
  createHash('sha1').update(`${time} ${sapisid} https://www.youtube.com`).digest('hex')

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
    const entries = await readBrowserHistory(session, { now: NOW, onProgress: (count) => counts.push(count) })
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
})

describe('the day YouTube lists a video under', () => {
  it('reads the headings of the History page as local days', () => {
    expect(dayOf('Today', NOW)).toBe('2026-10-13')
    expect(dayOf('Yesterday', NOW)).toBe('2026-10-12')
    // 2026-10-13 is a Tuesday
    expect(dayOf('Sunday', NOW)).toBe('2026-10-11')
    expect(dayOf('Wednesday', NOW)).toBe('2026-10-07')
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
