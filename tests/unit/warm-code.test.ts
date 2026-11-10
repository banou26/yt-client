import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { reloadPage, warmLazyCode } from '../../src/warm-code'

type Link = { rel?: string, crossOrigin?: string, href?: string }

const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

const settle = () => new Promise(resolve => setImmediate(resolve))

let links: Link[]
let reloads: number
let online: (() => void) | undefined
let requests: { href: string, init: RequestInit | undefined, answer: ReturnType<typeof deferred<Response>>, done: boolean }[]

const fetched = () => requests.map(({ href }) => href)

const waitingFor = (href?: string) => requests.filter(request => !request.done && (!href || request.href === href))

// answers the request for `href` still waiting, with its body ready
const answer = (href: string, status: number) => {
  const [request] = waitingFor(href)
  request!.done = true
  request!.answer.resolve({ ok: status < 300, status, arrayBuffer: async () => new ArrayBuffer(8) } as Response)
}

const failAll = () => {
  for (const request of waitingFor()) {
    request.done = true
    request.answer.reject(new TypeError('Failed to fetch'))
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  links = []
  reloads = 0
  online = undefined
  requests = []
  vi.stubGlobal('document', { createElement: () => ({}), head: { append: (link: Link) => links.push(link) } })
  vi.stubGlobal('location', { reload: () => reloads++ })
  vi.stubGlobal('addEventListener', (type: string, listener: () => void) => {
    if (type === 'online') online = listener
  })
  vi.stubGlobal('fetch', (href: string, init?: RequestInit) => {
    const request = { href, init, answer: deferred<Response>(), done: false }
    requests.push(request)
    return request.answer.promise
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('warmLazyCode', () => {
  it('adds a file\'s modulepreload link only once its download worked and its body was read', async () => {
    warmLazyCode(['/assets/search-a.js'])
    expect(requests).toMatchObject([{ href: '/assets/search-a.js', init: { priority: 'low' } }])
    await settle()
    expect(links).toEqual([])

    const body = deferred<ArrayBuffer>()
    requests[0]!.answer.resolve({ ok: true, status: 200, arrayBuffer: () => body.promise } as Response)
    await settle()
    expect(links).toEqual([])

    body.resolve(new ArrayBuffer(8))
    await settle()
    expect(links).toEqual([{ rel: 'modulepreload', crossOrigin: '', href: '/assets/search-a.js' }])
  })

  it('adds no link for a failed download, and downloads it again once the browser is back online', async () => {
    warmLazyCode(['/assets/search-a.js', '/assets/watch-b.js'])
    answer('/assets/watch-b.js', 200)
    failAll()
    await settle()
    expect(links.map(({ href }) => href)).toEqual(['/assets/watch-b.js'])

    online?.()
    expect(fetched()).toEqual(['/assets/search-a.js', '/assets/watch-b.js', '/assets/search-a.js'])
    answer('/assets/search-a.js', 200)
    await settle()
    expect(links.map(({ href }) => href)).toEqual(['/assets/watch-b.js', '/assets/search-a.js'])
  })

  it('downloads a failed file again after retryMs with no online event, and stops once it worked', async () => {
    warmLazyCode(['/assets/search-a.js'], 5_000)
    failAll()
    await settle()
    vi.advanceTimersByTime(4_999)
    expect(fetched()).toEqual(['/assets/search-a.js'])

    vi.advanceTimersByTime(1)
    expect(fetched()).toEqual(['/assets/search-a.js', '/assets/search-a.js'])
    answer('/assets/search-a.js', 200)
    await settle()
    vi.advanceTimersByTime(20_000)
    online?.()
    expect(fetched()).toHaveLength(2)
    expect(links).toHaveLength(1)
  })

  it('never asks again for a file answering 404, which a deploy removed, and asks again for one answering 503', async () => {
    warmLazyCode(['/assets/search-a.js', '/assets/watch-b.js'], 5_000)
    answer('/assets/search-a.js', 404)
    answer('/assets/watch-b.js', 503)
    await settle()
    expect(links).toEqual([])

    online?.()
    expect(fetched()).toEqual(['/assets/search-a.js', '/assets/watch-b.js', '/assets/watch-b.js'])
    answer('/assets/watch-b.js', 503)
    await settle()
    vi.advanceTimersByTime(5_000)
    expect(fetched()).toEqual(['/assets/search-a.js', '/assets/watch-b.js', '/assets/watch-b.js', '/assets/watch-b.js'])
  })
})

describe('reloadPage', () => {
  it('fetches every file still waiting again, and reloads only once each fetch settled', async () => {
    warmLazyCode(['/assets/search-a.js', '/assets/watch-b.js', '/assets/privacy-c.js'])
    answer('/assets/search-a.js', 200)
    answer('/assets/privacy-c.js', 404)
    failAll()
    await settle()

    const reloaded = reloadPage()
    expect(fetched().slice(3)).toEqual(['/assets/watch-b.js'])
    await settle()
    expect(reloads).toBe(0)

    answer('/assets/watch-b.js', 200)
    await reloaded
    expect(reloads).toBe(1)
  })
})
