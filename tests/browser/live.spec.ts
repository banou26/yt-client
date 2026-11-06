import type { Page } from '@playwright/test'

import { expect, test as base } from './test'

// a 24/7 stream with its chat on, and the VOD a finished NASA broadcast left behind (both read 2026-11-06)
const LIVE = 'rFZHOHl-L8A'
const ENDED = 'rSvCuSQhC3w'

/* Every live answer to an automated browser is status 2, then 3, so no build plays past about 30 s: with
   navigator.webdriver true (YTB-28), and headless with its HeadlessChrome user agent (measured 2026-11-06, status 1
   once the agent names plain Chrome). */
const test = base.extend<object, object>({
  userAgent: async ({ browser }, use) => {
    await use(`Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browser.version()} Safari/537.36`)
  },
  browser: [async ({ playwright, browserName, headless, launchOptions }, use) => {
    const browser = await playwright[browserName].launch({
      ...launchOptions,
      headless,
      args: [...(launchOptions.args ?? []), '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--disable-blink-features=AutomationControlled'],
      ignoreDefaultArgs: ['--enable-automation'],
    })
    await use(browser)
    await browser.close()
  }, { scope: 'worker' }],
})

type FrameApiLog = {
  openPlayback: number
  selectedVideoKeys: string[]
  videoKeys: string[]
  chatAnswers: number[]
}

declare global {
  interface Window { frameApiLog?: FrameApiLog }
}

// the app reaches the engine through a MessagePort: calls are `{ id, method, args }`, answers `{ id, result | error }`
const watchFrameApi = () => {
  if (window.top !== window) return
  const log: FrameApiLog = { openPlayback: 0, selectedVideoKeys: [], videoKeys: [], chatAnswers: [] }
  window.frameApiLog = log
  const asked = new WeakMap<MessagePort, Map<number, string>>()
  const askedOn = (port: MessagePort) => asked.get(port) ?? asked.set(port, new Map()).get(port)!
  const post = Object.getOwnPropertyDescriptor(MessagePort.prototype, 'postMessage')!.value as (this: MessagePort, message: unknown, ...rest: unknown[]) => void
  MessagePort.prototype.postMessage = function (this: MessagePort, message: unknown, ...rest: unknown[]) {
    const call = message as { id?: number, method?: string, args?: [{ track?: string, kind?: string, formatKey?: string }] } | null
    if (call?.method && call.id !== undefined) askedOn(this).set(call.id, call.method)
    if (call?.method === 'openPlayback') log.openPlayback += 1
    const segment = call?.method === 'requestSegment' ? call.args?.[0] : undefined
    if (segment?.track === 'video' && segment.kind === 'media' && segment.formatKey) log.videoKeys.push(segment.formatKey)
    return post.call(this, message, ...rest)
  } as typeof MessagePort.prototype.postMessage
  // inherited from EventTarget, so MessagePort.prototype has no own descriptor for it
  const listen = Object.getOwnPropertyDescriptor(EventTarget.prototype, 'addEventListener')!.value as MessagePort['addEventListener']
  const note = (port: MessagePort, event: MessageEvent) => {
    const answer = event.data as { id?: number, progress?: unknown, result?: { selectedVideoKey?: string }, error?: unknown } | null
    if (!answer || answer.id === undefined || 'progress' in answer || answer.error) return
    const method = askedOn(port).get(answer.id)
    if (method === 'openPlayback' && answer.result?.selectedVideoKey) log.selectedVideoKeys.push(answer.result.selectedVideoKey)
    if (method === 'liveChat') log.chatAnswers.push(Date.now())
  }
  MessagePort.prototype.addEventListener = function (this: MessagePort, type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) {
    if (type !== 'message' || typeof listener !== 'function') return listen.call(this, type, listener, options)
    const wrapped = (event: MessageEvent) => {
      note(this, event)
      return listener.call(this, event)
    }
    return listen.call(this, type, wrapped as EventListener, options)
  } as typeof MessagePort.prototype.addEventListener
}

const frameApiLog = (page: Page) => page.evaluate(() => window.frameApiLog!)

const sample = (page: Page) => page.evaluate(() => {
  const video = document.querySelector<HTMLVideoElement>('[data-player-root] video')
  const manifest = (globalThis as { __liveManifest?: { manifest: string } }).__liveManifest?.manifest ?? ''
  const last = [...manifest.matchAll(/<S t="(\d+)" d="(\d+)"\/>/g)].at(-1)
  return {
    time: video?.currentTime ?? 0,
    readyState: video?.readyState ?? 0,
    // where the delivered timeline ends, which is where the server's head was when it was last answered
    edge: last ? (Number(last[1]) + Number(last[2])) / 1_000 : undefined,
  }
})

const chatRows = (page: Page) => page.locator('.log .row').count()

test('a 24/7 live stream plays near its head for 60 s on one engine, with its chat', async ({ page }) => {
  test.setTimeout(300_000)
  let engineLoads = 0
  page.on('request', (request) => {
    if (request.resourceType() === 'document' && /^\/__yt_[a-z]+__\/(host|engine)\.html$/.test(new URL(request.url()).pathname)) engineLoads += 1
  })
  await page.addInitScript(watchFrameApi)
  await page.goto(`/watch/${LIVE}`)
  await expect.poll(async () => {
    const point = await sample(page)
    return point.readyState >= 3 && point.time > 0
  }, { timeout: 120_000 }).toBe(true)
  const samples: Awaited<ReturnType<typeof sample>>[] = []
  for (let second = 0; second <= 60; second += 1) {
    samples.push(await sample(page))
    await page.waitForTimeout(1_000)
  }
  // only steps of real play count: the player also jumps forward over missing media, which a frozen stream does too
  const steps = samples.slice(1).map((point, index) => {
    const step = point.time - samples[index]!.time
    return step > 0 && step < 1.5 && point.readyState >= 3 ? step : 0
  })
  const played = steps.reduce((total, step) => total + step, 0)
  const playedLast = steps.slice(-10).reduce((total, step) => total + step, 0)
  const behind = Math.max(...samples.map((point) => (point.edge ?? Infinity) - point.time))
  const edges = samples.map((point) => point.edge ?? 0)
  const advanced = edges.at(-1)! - edges[0]!
  const log = await frameApiLog(page)
  const rows = await chatRows(page)
  console.log(`live: played ${played.toFixed(1)} s of 60 (${playedLast.toFixed(1)} of the last 10), at most ${behind.toFixed(1)} s behind the timeline's end, `
    + `which moved ${advanced.toFixed(1)} s; engine loads ${engineLoads}, playback opens ${log.openPlayback}, `
    + `video formats ${[...new Set(log.videoKeys)].join(' ')} against ${log.selectedVideoKeys.join(' ')}, chat rows ${rows}`)
  expect(played, 'the stream did not keep playing').toBeGreaterThan(45)
  expect(playedLast, 'the stream stopped playing before the end').toBeGreaterThan(7)
  expect(behind, 'the playhead fell behind the live timeline').toBeLessThan(60)
  // the timeline follows the server's head in real time, not a race through the 12 h DVR window behind it
  expect(advanced).toBeGreaterThan(30)
  expect(advanced).toBeLessThan(90)
  expect(engineLoads, 'the engine was replaced').toBe(1)
  expect(log.openPlayback, 'the playback was opened again').toBe(1)
  // Shaka asks for the format the frame's session already streams
  expect([...new Set(log.videoKeys)]).toEqual(log.selectedVideoKeys)
  expect(rows).toBeGreaterThan(0)
})

test('live chat keeps polling across an engine reset', async ({ page }) => {
  test.setTimeout(300_000)
  await page.addInitScript(watchFrameApi)
  await page.goto(`/watch/${LIVE}`)
  await expect.poll(() => chatRows(page), { timeout: 120_000 }).toBeGreaterThan(0)
  // the dev server hands back the app's own module instance, so this is the reset the player itself makes
  await page.evaluate(async (module) => {
    const client = await import(/* @vite-ignore */ module) as { resetEngine: () => void }
    client.resetEngine()
  }, '/src/scramjet/client.ts')
  const resetAt = await page.evaluate(() => Date.now())
  const rows = await chatRows(page)
  await page.waitForTimeout(60_000)
  const answers = (await frameApiLog(page)).chatAnswers.filter((at) => at > resetAt).length
  console.log(`live chat: ${answers} answers in the 60 s after the reset, rows ${rows} then ${await chatRows(page)}`)
  // an answer parks up to 6 s, so a chat that keeps polling answers about every 6 s; one that stopped answers once or never
  expect(answers).toBeGreaterThanOrEqual(5)
  expect(await chatRows(page)).toBeGreaterThan(rows)
})

test('a finished stream plays as a normal video', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto(`/watch/${ENDED}`)
  const time = () => page.locator('[data-player-root] video').evaluate((video) => (video as HTMLVideoElement).currentTime)
  await expect.poll(time, { timeout: 120_000 }).toBeGreaterThan(1)
  const duration = await page.locator('[data-player-root] video').evaluate((video) => (video as HTMLVideoElement).duration)
  expect(Number.isFinite(duration) && duration > 3_600, `duration ${duration}`).toBe(true)
  await expect(page.locator('.scrubber.live')).toHaveCount(0)
  const from = await time()
  await expect.poll(time, { timeout: 30_000 }).toBeGreaterThan(from + 3)
})
