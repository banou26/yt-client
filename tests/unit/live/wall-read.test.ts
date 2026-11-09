import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import { stepEnabled } from '../../../src/engine/step-flag'
import { type Account, bestAccount, directReported, held, keptInCopy, manifestChanges, parseStep, setStep, tokenStored, unpassed } from '../../live/wall-read'

const seek = { target: 90 }

describe('a seek window that read no pass', () => {
  it('reads a wall or an inconclusive only from a session that held to the end of the window (control)', () => {
    expect(unpassed({ ...seek, maxBuffered: 20, ended: null }).verdict).toBe('wall')
    expect(unpassed({ ...seek, maxBuffered: 80, ended: null }).verdict).toBe('inconclusive')
  })

  it('refuses a session that ended after the seek, whatever it had buffered, since its buffer went with it', () => {
    const ended = { s: 3.2, status: 'Retrying playback' }
    expect(unpassed({ ...seek, maxBuffered: 20, ended })).toEqual({
      verdict: 'refused',
      reason: 'the first session ended 3.2s after the seek: Retrying playback, having buffered to 20',
    })
    expect(unpassed({ ...seek, maxBuffered: 80, ended: { s: 1, status: null } }).verdict).toBe('refused')
  })
})

describe('a control', () => {
  it('holds or fails on a pass or a wall (control)', () => {
    expect([held('detector', 'pass'), held('detector', 'wall')]).toEqual(['true', 'false'])
    expect([held('webdriver', 'wall'), held('webdriver', 'pass')]).toEqual(['true', 'false'])
  })

  it('reads neither held nor failed when the run reached no verdict', () => {
    for (const verdict of ['refused', 'inconclusive', 'no-playback', 'error', null] as const) {
      expect([held('detector', verdict), held('webdriver', verdict)]).toEqual(['-', '-'])
    }
  })
})

describe('the token store reading', () => {
  afterEach(() => void vi.useRealTimers())

  it('reads presence, and an evaluate that throws as unknown (control)', async () => {
    expect(await tokenStored({ evaluate: async () => true })).toBe(true)
    expect(await tokenStored({ evaluate: async () => false })).toBe(false)
    expect(await tokenStored({ evaluate: async () => { throw new Error('target closed') } })).toBe(null)
  })

  it('reads a page that never answers as unknown within 2 s, rather than holding the run open', async () => {
    vi.useFakeTimers()
    let read: boolean | null | 'pending' = 'pending'
    void tokenStored({ evaluate: () => new Promise<boolean>(() => {}) }).then(value => { read = value })
    await vi.advanceTimersByTimeAsync(2_000)
    expect(read).toBe(null)
  })
})

describe('a profile listing', () => {
  const before = { 'Local State': '9473:1', Default: 'dir:1', 'Default/Cookies': '20480:1' }

  it('reads no change between two equal listings (control)', () => {
    expect(manifestChanges(before, { ...before })).toEqual([])
  })

  it('names every path added, removed or written, by size or by mtime alone', () => {
    const { 'Local State': _removed, ...rest } = before
    expect(manifestChanges(before, { ...rest, 'Default/Cookies': '20480:2', SingletonLock: 'link:2' }))
      .toEqual(['Default/Cookies', 'Local State', 'SingletonLock'])
    expect(manifestChanges(before, { ...before, 'Default/Cookies': '24576:1' })).toEqual(['Default/Cookies'])
  })
})

describe('a profile copy', () => {
  const kept = keptInCopy('/profiles/master')

  it('keeps the session: cookies, storage and the profile root (control)', () => {
    for (const path of ['', '/Local State', '/Default', '/Default/Cookies', '/Default/IndexedDB', '/Default/Local Storage']) {
      expect(kept(`/profiles/master${path}`)).toBe(true)
    }
  })

  it('leaves out the service workers, whose stored shell fails a first load once a deploy renames its chunks', () => {
    expect(kept('/profiles/master/Default/Service Worker')).toBe(false)
  })
})

describe('the account reading', () => {
  it('keeps the strongest reading seen, so a later page that lost the header cannot undo an avatar', () => {
    expect((['none', 'initial', 'avatar', 'none'] as Account[]).reduce<Account | null>(bestAccount, null)).toBe('avatar')
    expect(bestAccount('initial', null)).toBe('initial')
  })

  it('reads none from a session that only ever showed the sign-in button (control)', () => {
    expect((['none', 'none'] as Account[]).reduce<Account | null>(bestAccount, null)).toBe('none')
    expect(bestAccount(null, null)).toBe(null)
  })
})

describe('a step run', () => {
  afterEach(() => void vi.unstubAllGlobals())

  // the app's storage as the init script leaves it, read back the way step-flag.ts reads it
  const runWith = (arg: string) => {
    const stored: Record<string, string> = {}
    vi.stubGlobal('location', { origin: 'https://youtube.fkn.app' })
    vi.stubGlobal('localStorage', {
      setItem: (key: string, value: string) => { stored[key] = value },
      getItem: (key: string) => stored[key] ?? null,
    })
    setStep({ origin: 'https://youtube.fkn.app', ...parseStep(arg) })
  }

  it('turns a step on with its bare name, the key and value the app reads', () => {
    runWith('direct')
    expect(stepEnabled('direct')).toBe(true)
    expect(parseStep('direct').label).toBe('direct')
  })

  it('turns a step that is on by default off with :0, so a control arm runs without it', () => {
    runWith('y1:0')
    expect(stepEnabled('y1')).toBe(false)
    runWith('direct:0')
    expect(stepEnabled('direct')).toBe(false)
    expect(parseStep('direct:0').label).toBe('direct:0')
    runWith('y1:1')
    expect(stepEnabled('y1')).toBe(true)
  })

  it('refuses a name that is not a step, and a value the app does not read', () => {
    for (const arg of ['', 'Direct', 'direct:', 'direct:2', 'direct:true', 'direct:0:1']) {
      expect(() => parseStep(arg), arg).toThrow('--step=')
    }
  })

  it("sets the step on the app's own origin only, leaving every other frame's storage alone", () => {
    const stored: Record<string, Record<string, string>> = {}
    const frame = (origin: string) => {
      vi.stubGlobal('location', { origin })
      vi.stubGlobal('localStorage', { setItem: (key: string, value: string) => { (stored[origin] ??= {})[key] = value } })
      setStep({ origin: 'https://youtube.fkn.app', key: 'yt-client:step:direct', value: '1' })
    }
    frame('https://youtube.fkn.app')
    frame('https://fkn.app')
    frame('https://s-www-youtube-com.sdbx.app')
    expect(stored).toEqual({ 'https://youtube.fkn.app': { 'yt-client:step:direct': '1' } })
  })
})

describe('the direct lane reading', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  const page = (dataset: Record<string, string>) => {
    vi.stubGlobal('document', { documentElement: { dataset } })
    return { evaluate: async (read: () => string | null) => read() }
  }

  it("reads the lane's own words, and none when the page published nothing (control)", async () => {
    expect(await directReported(page({ ytDirect: 'on' }))).toBe('on')
    expect(await directReported(page({ ytDirect: 'off' }))).toBe('off')
    expect(await directReported(page({ ytDirect: 'skipped' }))).toBe('skipped')
    expect(await directReported(page({}))).toBe(null)
  })

  it('prints no value the app did not mean, and reads a page that never answers as unknown within 2 s', async () => {
    expect(await directReported(page({ ytDirect: 'something else' }))).toBe('other')
    expect(await directReported({ evaluate: async () => { throw new Error('target closed') } })).toBe(null)
    vi.useFakeTimers()
    let read: string | null | undefined
    void directReported({ evaluate: () => new Promise<string | null>(() => {}) }).then(value => { read = value })
    await vi.advanceTimersByTimeAsync(2_000)
    expect(read).toBe(null)
  })
})
