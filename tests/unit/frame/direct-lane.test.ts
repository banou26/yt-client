import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import type { DirectReport } from '../../../src/frame/protocol'

import { FRAME_DIRECT_CONNECT } from '../../../src/frame/protocol'

const SEARCH = 'https://www.youtube.com/youtubei/v1/search?prettyPrint=false&alt=json'
const CAPTIONS = 'https://www.youtube.com/api/timedtext?v=dQw4w9WgXcQ&caps=asr&ip=0.0.0.0&ipbits=0&sparams=ip%2Cipbits%2Cv%2Ccaps&signature=AB12&key=yt8&lang=en&fmt=json3'
const VISITOR = 'CgtWSVNJVE9SXzEyMyiA'
const PAYLOAD = JSON.stringify({ context: { client: { clientName: 'WEB', visitorData: VISITOR } }, query: 'lofi' })

// what youtubei.js's HTTPClient hands its fetch for an InnerTube call: a Request, and the processed body and headers in init
const youtubeiCall = (url = SEARCH, body = PAYLOAD, extra: Record<string, string> = {}) => [
  new Request(url, { method: 'POST', body }),
  {
    body,
    headers: new Headers({
      Accept: '*/*',
      'Accept-Language': '*',
      'Content-Type': 'application/json',
      'X-Goog-Visitor-Id': VISITOR,
      'X-Origin': 'https://www.youtube.com',
      'X-Youtube-Client-Name': '1',
      'X-Youtube-Client-Version': '2.20260618.05.00',
      ...extra,
    }),
    redirect: 'follow',
    credentials: 'include',
  } satisfies RequestInit,
] as const

type Sent = { url: string, init: RequestInit }

// the frame's lane wired to the app realm's over a real MessageChannel, as host.ts connects them
const wire = async ({ answer, signedIn = false }: { answer: (url: string, init: RequestInit) => Promise<Response>, signedIn?: boolean }) => {
  const dataset: Record<string, string> = {}
  vi.stubGlobal('window', {})
  vi.stubGlobal('document', { documentElement: { dataset } })
  const sent: Sent[] = []
  const today = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('today'))
  const { openDirectLane } = await import('../../../src/scramjet/direct-lane')
  // the lane always sends a url string
  const lane = openDirectLane(async (url, init) => {
    sent.push({ url: url as string, init: init! })
    return answer(url as string, init!)
  })
  const frame = await import('../../../src/frame/direct')
  ;(window as unknown as Record<string, (port: MessagePort) => void>)[FRAME_DIRECT_CONNECT]!(lane.port)
  let clock = 1_000
  const youtubeFetch = frame.createYoutubeFetch({
    fetch: today,
    direct: frame.directLane,
    signedIn: () => signedIn,
    report: frame.reportDirect,
    now: () => clock,
  })
  return {
    youtubeFetch,
    today,
    sent,
    dataset,
    lane,
    advance: (ms: number) => { clock += ms },
    skipMs: frame.DIRECT_SKIP_MS,
  }
}

// the lane's reports and answers cross a MessagePort, which delivers on a later turn
const flush = () => new Promise((resolve) => setTimeout(resolve, 10))

describe('the direct lane', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends a youtubei.js InnerTube call as a simple request: POST, a text/plain body, no other header, no credentials', async () => {
    const { youtubeFetch, sent, today, dataset, lane } = await wire({ answer: async () => new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } }) })
    const response = await youtubeFetch(...youtubeiCall())
    expect(today).not.toHaveBeenCalled()
    expect(sent).toHaveLength(1)
    expect(sent[0]!.url).toBe(SEARCH)
    const { signal, ...init } = sent[0]!.init
    expect(signal).toBeInstanceOf(AbortSignal)
    expect(init).toEqual({
      method: 'POST',
      headers: { 'content-type': 'text/plain;charset=UTF-8' },
      body: PAYLOAD,
      credentials: 'omit',
      mode: 'cors',
      redirect: 'follow',
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/json')
    expect(await response.json()).toEqual({ ok: true })
    await flush()
    expect(dataset.ytDirect).toBe('on')
    lane.close()
  })

  it('sends a caption GET from the app realm with no header and no credentials, and answers with its cues', async () => {
    const cues = '{"events":[{"tStartMs":0,"dDurationMs":1000,"segs":[{"utf8":"Never"}]}]}'
    const { youtubeFetch, sent, today, dataset, lane } = await wire({ answer: async () => new Response(cues, { headers: { 'content-type': 'application/json' } }) })
    const response = await youtubeFetch(CAPTIONS, { credentials: 'include' })
    expect(today).not.toHaveBeenCalled()
    expect(sent).toHaveLength(1)
    expect(sent[0]!.url).toBe(CAPTIONS)
    const { signal, ...init } = sent[0]!.init
    expect(signal).toBeInstanceOf(AbortSignal)
    expect(init).toEqual({ method: 'GET', credentials: 'omit', mode: 'cors', redirect: 'follow' })
    expect(await response.text()).toBe(cues)
    await flush()
    expect(dataset.ytDirect).toBe('on')
    lane.close()
  })

  it('sends a signed-in caption GET on today\'s path, with the frame\'s own credentials', async () => {
    const { youtubeFetch, sent, today, lane } = await wire({ answer: async () => new Response('{}'), signedIn: true })
    await youtubeFetch(CAPTIONS, { credentials: 'include' })
    expect(sent).toHaveLength(0)
    expect(today).toHaveBeenCalledWith(CAPTIONS, { credentials: 'include' })
    lane.close()
  })

  it('drops X-Origin from youtubei.js\'s /config call and keeps its visitorData in the body', async () => {
    const { youtubeFetch, sent, lane } = await wire({ answer: async () => new Response('{}') })
    const config = JSON.stringify({ context: { client: { clientName: 'WEB', visitorData: VISITOR } } })
    await youtubeFetch('https://www.youtube.com/youtubei/v1/config?prettyPrint=false', {
      method: 'POST',
      headers: { 'X-Origin': 'https://www.youtube.com', 'X-Goog-Visitor-Id': VISITOR, Referer: 'https://www.youtube.com' },
      body: config,
    })
    expect(sent[0]!.init.headers).toEqual({ 'content-type': 'text/plain;charset=UTF-8' })
    expect(sent[0]!.init.body).toBe(config)
    lane.close()
  })

  it('returns a non-2xx direct answer as YouTube\'s own, never resent on today\'s path', async () => {
    const { youtubeFetch, today, sent, lane } = await wire({ answer: async () => new Response('{"error":{"code":400}}', { status: 400, statusText: 'Bad Request' }) })
    const response = await youtubeFetch(...youtubeiCall())
    expect(response.status).toBe(400)
    expect(await response.text()).toBe('{"error":{"code":400}}')
    expect(today).not.toHaveBeenCalled()
    expect(sent).toHaveLength(1)
    lane.close()
  })

  it('sends a signed-in call on today\'s path, and reports the lane off', async () => {
    const { youtubeFetch, today, sent, dataset, lane } = await wire({ answer: async () => new Response('{}'), signedIn: true })
    await youtubeFetch(...youtubeiCall())
    expect(sent).toHaveLength(0)
    expect(today).toHaveBeenCalledOnce()
    await flush()
    expect(dataset.ytDirect).toBe('off')
    lane.close()
  })

  it('sends a call carrying an account on today\'s path even when the frame reads no session', async () => {
    const { youtubeFetch, today, sent, lane } = await wire({ answer: async () => new Response('{}') })
    await youtubeFetch(...youtubeiCall(SEARCH, PAYLOAD, { Authorization: 'SAPISIDHASH 1_abc' }))
    expect(sent).toHaveLength(0)
    expect(today).toHaveBeenCalledOnce()
    lane.close()
  })

  it('keeps every request that is not an InnerTube POST or a caption GET on today\'s path', async () => {
    const { youtubeFetch, today, sent, lane } = await wire({ answer: async () => new Response('{}') })
    await youtubeFetch('https://www.youtube.com/sw.js_data', { headers: { Cookie: 'PREF=tz=UTC' } })
    await youtubeFetch('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    await youtubeFetch('https://www.youtube.com/iframe_api')
    await youtubeFetch('https://www.youtube.com/api/jnn/v1/GenerateIT', { method: 'POST', body: '[]' })
    await youtubeFetch('https://s.youtube.com/api/stats/playback?cpn=x', { method: 'POST', body: '' })
    await youtubeFetch('https://youtubei.googleapis.com/youtubei/v1/search', { method: 'POST', body: PAYLOAD })
    await youtubeFetch('https://www.youtube.com/youtubei/v1/browse', { method: 'PUT', body: PAYLOAD })
    await youtubeFetch('https://www.youtube.com/youtubei/v1/browse')
    await youtubeFetch(CAPTIONS, { method: 'POST', body: '' })
    await youtubeFetch('https://www.youtube.com/api/timedtext/list')
    expect(sent).toHaveLength(0)
    expect(today).toHaveBeenCalledTimes(10)
    lane.close()
  })

  it('never goes direct while the step is off: no lane is connected', async () => {
    vi.stubGlobal('window', {})
    const frame = await import('../../../src/frame/direct')
    expect(frame.directLane()).toBeUndefined()
    const today = vi.fn(async () => new Response('today'))
    const youtubeFetch = frame.createYoutubeFetch({ fetch: today, direct: frame.directLane, signedIn: () => false, report: frame.reportDirect })
    const response = await youtubeFetch(...youtubeiCall())
    expect(await response.text()).toBe('today')
    expect(today).toHaveBeenCalledOnce()
  })

  it('resends a TypeError on today\'s path, and skips direct for the window only when that path answers', async () => {
    let down = true
    const { youtubeFetch, today, sent, dataset, advance, skipMs, lane } = await wire({
      answer: async () => {
        if (down) throw new TypeError('Failed to fetch')
        return new Response('{"direct":true}')
      },
    })
    const first = await youtubeFetch(...youtubeiCall())
    expect(await first.text()).toBe('today')
    expect(sent).toHaveLength(1)
    expect(today).toHaveBeenCalledOnce()
    await flush()
    expect(dataset.ytDirect).toBe('skipped')

    down = false
    advance(skipMs - 1)
    await youtubeFetch(...youtubeiCall())
    expect(sent).toHaveLength(1)
    expect(today).toHaveBeenCalledTimes(2)

    advance(1)
    const after = await youtubeFetch(...youtubeiCall())
    expect(await after.text()).toBe('{"direct":true}')
    expect(sent).toHaveLength(2)
    expect(today).toHaveBeenCalledTimes(2)
    await flush()
    expect(dataset.ytDirect).toBe('on')
    lane.close()
  })

  it('keeps direct on when today\'s path fails the resend too, since an outage fails both', async () => {
    let down = true
    const { youtubeFetch, today, sent, lane } = await wire({
      answer: async () => {
        if (down) throw new TypeError('Failed to fetch')
        return new Response('{}')
      },
    })
    today.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(youtubeFetch(...youtubeiCall())).rejects.toThrow('Failed to fetch')
    expect(today).toHaveBeenCalledOnce()

    down = false
    await youtubeFetch(...youtubeiCall())
    expect(sent).toHaveLength(2)
    expect(today).toHaveBeenCalledOnce()
    lane.close()
  })

  it('keeps direct on when today\'s path answers the resend with an error status', async () => {
    const { youtubeFetch, today, sent, lane } = await wire({ answer: async () => { throw new TypeError('Failed to fetch') } })
    today.mockResolvedValueOnce(new Response('', { status: 503 }))
    expect((await youtubeFetch(...youtubeiCall())).status).toBe(503)
    today.mockResolvedValueOnce(new Response('today'))
    await youtubeFetch(...youtubeiCall())
    expect(sent).toHaveLength(2)
    lane.close()
  })

  it('does not resend a failure that is not a TypeError', async () => {
    const { youtubeFetch, today, lane } = await wire({ answer: async () => { throw new Error('something else') } })
    await expect(youtubeFetch(...youtubeiCall())).rejects.toThrow('something else')
    expect(today).not.toHaveBeenCalled()
    lane.close()
  })

  it('cancels an aborted call in the app realm and does not resend it', async () => {
    let aborted: AbortSignal | undefined
    const { youtubeFetch, today, lane } = await wire({
      answer: (_url, init) => new Promise((_resolve, reject) => {
        aborted = init.signal!
        init.signal!.addEventListener('abort', () => reject(new TypeError('aborted')), { once: true })
      }),
    })
    const controller = new AbortController()
    const [request, init] = youtubeiCall()
    const call = youtubeFetch(request, { ...init, signal: controller.signal })
    await flush()
    controller.abort()
    await expect(call).rejects.toThrow()
    await flush()
    expect(aborted?.aborted).toBe(true)
    expect(today).not.toHaveBeenCalled()
    lane.close()
  })

  it('refuses a url that is not InnerTube in the app realm, as an error the frame does not resend', async () => {
    vi.stubGlobal('document', { documentElement: { dataset: {} } })
    const { openDirectLane } = await import('../../../src/scramjet/direct-lane')
    const send = vi.fn(async () => new Response('{}'))
    const lane = openDirectLane(send)
    const reply = new Promise<unknown>((resolve) => lane.port.addEventListener('message', (event) => resolve(event.data), { once: true }))
    lane.port.start()
    lane.port.postMessage({ type: 'fetch', id: 1, url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', body: '' })
    expect(await reply).toEqual({ id: 1, error: expect.stringContaining('only InnerTube and captions'), network: false })
    expect(send).not.toHaveBeenCalled()
    lane.close()
  })

  it('reports each state to the app realm once per change', async () => {
    const { dataset, lane } = await wire({ answer: async () => new Response('{}') })
    const writes: string[] = []
    Object.defineProperty(dataset, 'ytDirect', { set: (value: string) => { writes.push(value) } })
    const frame = await import('../../../src/frame/direct')
    for (const value of ['on', 'on', 'skipped', 'skipped', 'on'] as DirectReport[]) frame.reportDirect(value)
    await flush()
    expect(writes).toEqual(['on', 'skipped', 'on'])
    lane.close()
  })
})
